#![allow(non_snake_case)]

use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, ErrorKind};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use vrcx_0_host::host_capabilities::{require_host_capability, HostCapability};
use vrcx_0_host::vrchat_paths;

const LOG_TIME_FORMAT: &str = "%Y.%m.%d %H:%M:%S";
const DEFAULT_ENTRY_LIMIT: usize = 300;
const MAX_ENTRY_LIMIT: usize = 1000;
const LOG_LEVELS: [&str; 3] = ["Debug", "Warning", "Error"];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VrchatLogFileOutput {
    pub file_name: String,
    pub modified_at: Option<String>,
    pub size: u64,
    pub latest: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VrchatLogEntryOutput {
    pub timestamp: String,
    pub level: String,
    pub category: Option<String>,
    pub message: String,
    pub raw: String,
    pub line_number: usize,
    pub end_line_number: usize,
    pub file_name: String,
    pub continuation_lines: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VrchatLogEntriesReadInput {
    pub file_name: String,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub query: Option<String>,
    pub levels: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VrchatLogTailReadInput {
    pub file_name: Option<String>,
    pub after_line_number: Option<usize>,
    pub file_size: Option<u64>,
    pub limit: Option<usize>,
    pub query: Option<String>,
    pub levels: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VrchatLogEntriesReadOutput {
    pub file_name: String,
    pub entries: Vec<VrchatLogEntryOutput>,
    pub offset: usize,
    pub next_offset: Option<usize>,
    pub total_entries: usize,
    pub total_lines: usize,
    pub last_line_number: usize,
    pub file_size: u64,
    pub file_modified_at: Option<String>,
    pub reset_required: bool,
}

struct LogFileCandidate {
    output: VrchatLogFileOutput,
    modified: SystemTime,
}

struct LogEntryFilter {
    query: Option<String>,
    levels: Option<HashSet<String>>,
    categories: Option<HashSet<String>>,
}

struct LogFileState {
    size: u64,
    modified_at: Option<String>,
}

#[tauri::command]
pub fn app__vrchat_log_files_list() -> Result<Vec<VrchatLogFileOutput>, AppError> {
    require_host_capability(HostCapability::VrchatPathDiscovery)?;
    list_log_files(&vrchat_paths::vrchat_app_data())
}

#[tauri::command]
pub fn app__vrchat_log_entries_read(
    input: VrchatLogEntriesReadInput,
) -> Result<VrchatLogEntriesReadOutput, AppError> {
    require_host_capability(HostCapability::VrchatPathDiscovery)?;

    let file_name = validate_log_file_name(&input.file_name)?.to_string();
    let file_state = log_file_state(&file_name)?;
    let (entries, total_lines) = read_log_entries(&file_name)?;
    let filter = LogEntryFilter::from_parts(input.query, input.levels, input.categories);
    let offset = input.offset.unwrap_or(0);
    let limit = normalize_limit(input.limit);
    let filtered_entries = entries
        .into_iter()
        .filter(|entry| filter.matches(entry))
        .collect::<Vec<_>>();
    let total_entries = filtered_entries.len();
    let page = filtered_entries
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    let next_offset = offset + page.len();

    Ok(VrchatLogEntriesReadOutput {
        file_name,
        entries: page,
        offset,
        next_offset: (next_offset < total_entries).then_some(next_offset),
        total_entries,
        total_lines,
        last_line_number: total_lines,
        file_size: file_state.size,
        file_modified_at: file_state.modified_at,
        reset_required: false,
    })
}

#[tauri::command]
pub fn app__vrchat_log_tail_read(
    input: VrchatLogTailReadInput,
) -> Result<VrchatLogEntriesReadOutput, AppError> {
    require_host_capability(HostCapability::VrchatPathDiscovery)?;

    let base_dir = vrchat_paths::vrchat_app_data();
    let file_name = match input.file_name.as_deref().map(str::trim) {
        Some(value) if !value.is_empty() => validate_log_file_name(value)?.to_string(),
        _ => latest_log_file_name(&base_dir)?,
    };
    let after_line_number = input.after_line_number.unwrap_or(0);
    let limit = normalize_limit(input.limit);
    let file_state = log_file_state(&file_name)?;

    if input
        .file_size
        .is_some_and(|previous_size| file_state.size < previous_size)
    {
        return Ok(VrchatLogEntriesReadOutput {
            file_name,
            entries: Vec::new(),
            offset: 0,
            next_offset: None,
            total_entries: 0,
            total_lines: 0,
            last_line_number: 0,
            file_size: file_state.size,
            file_modified_at: file_state.modified_at,
            reset_required: true,
        });
    }

    let total_lines = count_log_lines(&file_name)?;
    if total_lines <= after_line_number {
        return Ok(VrchatLogEntriesReadOutput {
            file_name,
            entries: Vec::new(),
            offset: 0,
            next_offset: None,
            total_entries: 0,
            total_lines,
            last_line_number: total_lines,
            file_size: file_state.size,
            file_modified_at: file_state.modified_at,
            reset_required: false,
        });
    }

    let (entries, total_lines) = read_log_entries(&file_name)?;
    let filter = LogEntryFilter::from_parts(input.query, input.levels, input.categories);
    let filtered_entries = entries
        .into_iter()
        .filter(|entry| entry.end_line_number > after_line_number && filter.matches(entry))
        .collect::<Vec<_>>();
    let total_entries = filtered_entries.len();
    let tail_entries = filtered_entries.into_iter().take(limit).collect::<Vec<_>>();
    let last_line_number = if tail_entries.len() >= limit {
        tail_entries
            .last()
            .map(|entry| entry.end_line_number)
            .unwrap_or(after_line_number)
    } else {
        total_lines
    };

    Ok(VrchatLogEntriesReadOutput {
        file_name,
        entries: tail_entries,
        offset: 0,
        next_offset: None,
        total_entries,
        total_lines,
        last_line_number,
        file_size: file_state.size,
        file_modified_at: file_state.modified_at,
        reset_required: false,
    })
}

impl LogEntryFilter {
    fn from_parts(
        query: Option<String>,
        levels: Option<Vec<String>>,
        categories: Option<Vec<String>>,
    ) -> Self {
        let query = query
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty());
        let levels = normalize_level_set(levels);
        let categories = categories
            .unwrap_or_default()
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect::<HashSet<_>>();

        Self {
            query,
            levels,
            categories: (!categories.is_empty()).then_some(categories),
        }
    }

    fn matches(&self, entry: &VrchatLogEntryOutput) -> bool {
        if let Some(levels) = &self.levels {
            if !levels.contains(&entry.level) {
                return false;
            }
        }

        if let Some(categories) = &self.categories {
            if !entry
                .category
                .as_deref()
                .is_some_and(|category| categories.contains(category))
            {
                return false;
            }
        }

        if let Some(query) = &self.query {
            let continuation_text = entry.continuation_lines.join("\n");
            let haystack = [
                entry.timestamp.as_str(),
                entry.level.as_str(),
                entry.category.as_deref().unwrap_or_default(),
                entry.message.as_str(),
                entry.raw.as_str(),
                continuation_text.as_str(),
            ]
            .join("\n")
            .to_ascii_lowercase();
            if !haystack.contains(query) {
                return false;
            }
        }

        true
    }
}

fn normalize_level_set(levels: Option<Vec<String>>) -> Option<HashSet<String>> {
    let normalized = levels
        .unwrap_or_default()
        .into_iter()
        .filter_map(|level| match level.trim().to_ascii_lowercase().as_str() {
            "debug" => Some("Debug".to_string()),
            "warning" | "warn" => Some("Warning".to_string()),
            "error" => Some("Error".to_string()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    (!normalized.is_empty()).then_some(normalized)
}

fn normalize_limit(limit: Option<usize>) -> usize {
    limit
        .unwrap_or(DEFAULT_ENTRY_LIMIT)
        .clamp(1, MAX_ENTRY_LIMIT)
}

fn latest_log_file_name(base_dir: &Path) -> Result<String, AppError> {
    list_log_files(base_dir)?
        .into_iter()
        .next()
        .map(|file| file.file_name)
        .ok_or_else(|| AppError::Custom("No VRChat output_log_*.txt files were found.".into()))
}

fn list_log_files(base_dir: &Path) -> Result<Vec<VrchatLogFileOutput>, AppError> {
    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let read_dir = match fs::read_dir(base_dir) {
        Ok(read_dir) => read_dir,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut candidates = Vec::new();
    for entry in read_dir {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        let Some(file_name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if validate_log_file_name(&file_name).is_err() {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        if !file_type.is_file() {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        candidates.push(LogFileCandidate {
            output: VrchatLogFileOutput {
                file_name,
                modified_at: Some(system_time_to_iso(modified)),
                size: metadata.len(),
                latest: false,
            },
            modified,
        });
    }

    candidates.sort_by(|left, right| {
        right
            .modified
            .cmp(&left.modified)
            .then_with(|| right.output.file_name.cmp(&left.output.file_name))
    });

    let mut files = candidates
        .into_iter()
        .map(|candidate| candidate.output)
        .collect::<Vec<_>>();
    if let Some(file) = files.first_mut() {
        file.latest = true;
    }
    Ok(files)
}

fn system_time_to_iso(time: SystemTime) -> String {
    let timestamp: chrono::DateTime<chrono::Utc> = time.into();
    timestamp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn read_log_entries(file_name: &str) -> Result<(Vec<VrchatLogEntryOutput>, usize), AppError> {
    let path = resolve_log_file_path(file_name)?;
    let bytes = fs::read(path)?;
    let content = String::from_utf8_lossy(&bytes);
    let total_lines = content.lines().count();
    Ok((parse_log_entries(file_name, &content), total_lines))
}

fn log_file_state(file_name: &str) -> Result<LogFileState, AppError> {
    let path = resolve_log_file_path(file_name)?;
    let metadata = fs::metadata(path)?;
    Ok(LogFileState {
        size: metadata.len(),
        modified_at: metadata.modified().ok().map(system_time_to_iso),
    })
}

fn count_log_lines(file_name: &str) -> Result<usize, AppError> {
    let path = resolve_log_file_path(file_name)?;
    let file = fs::File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    let mut count = 0;
    loop {
        buffer.clear();
        if reader.read_until(b'\n', &mut buffer)? == 0 {
            break;
        }
        count += 1;
    }
    Ok(count)
}

fn resolve_log_file_path(file_name: &str) -> Result<PathBuf, AppError> {
    let file_name = validate_log_file_name(file_name)?;
    let base_dir = vrchat_paths::vrchat_app_data();
    let canonical_base = base_dir.canonicalize().map_err(|error| {
        AppError::Custom(format!(
            "VRChat app data directory is not available: {error}"
        ))
    })?;
    let raw_path = base_dir.join(file_name);
    let raw_metadata = fs::symlink_metadata(&raw_path)?;
    if raw_metadata.file_type().is_symlink() || !raw_metadata.file_type().is_file() {
        return Err(AppError::Custom(
            "The selected VRChat log file is not a regular file.".into(),
        ));
    }
    let canonical_file = raw_path.canonicalize()?;
    if !canonical_file.starts_with(&canonical_base) {
        return Err(AppError::Custom(
            "VRChat log reads are limited to the VRChat app data directory.".into(),
        ));
    }
    if !canonical_file.is_file() {
        return Err(AppError::Custom(
            "The selected VRChat log file is not a regular file.".into(),
        ));
    }
    Ok(canonical_file)
}

fn validate_log_file_name(file_name: &str) -> Result<&str, AppError> {
    let file_name = file_name.trim();
    if file_name.is_empty()
        || file_name.contains("..")
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains(':')
    {
        return Err(AppError::Custom(
            "Invalid VRChat output log file name.".into(),
        ));
    }

    if !file_name.starts_with("output_log_") || !file_name.ends_with(".txt") {
        return Err(AppError::Custom(
            "VRChat log reads require an output_log_*.txt file.".into(),
        ));
    }
    Ok(file_name)
}

fn parse_log_entries(file_name: &str, content: &str) -> Vec<VrchatLogEntryOutput> {
    let mut entries = Vec::new();
    let mut current: Option<VrchatLogEntryOutput> = None;

    for (index, line) in content.lines().enumerate() {
        let line_number = index + 1;
        if let Some((timestamp, level, message)) = parse_log_header(line) {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            current = Some(VrchatLogEntryOutput {
                timestamp,
                level,
                category: extract_category(&message),
                message,
                raw: line.to_string(),
                line_number,
                end_line_number: line_number,
                file_name: file_name.to_string(),
                continuation_lines: Vec::new(),
            });
            continue;
        }

        if let Some(entry) = &mut current {
            entry.continuation_lines.push(line.to_string());
            entry.end_line_number = line_number;
        }
    }

    if let Some(entry) = current {
        entries.push(entry);
    }
    entries
}

fn parse_log_header(line: &str) -> Option<(String, String, String)> {
    let timestamp = line.get(..19)?;
    chrono::NaiveDateTime::parse_from_str(timestamp, LOG_TIME_FORMAT).ok()?;
    let rest = line.get(19..)?.trim_start();

    for level in LOG_LEVELS {
        let Some(after_level) = rest.strip_prefix(level) else {
            continue;
        };
        let message = after_level
            .trim_start()
            .strip_prefix('-')?
            .trim_start()
            .to_string();
        return Some((timestamp.to_string(), level.to_string(), message));
    }

    None
}

fn extract_category(message: &str) -> Option<String> {
    let trimmed = message.trim_start();
    let category = trimmed
        .strip_prefix('[')?
        .split_once(']')?
        .0
        .trim()
        .to_string();
    (!category.is_empty()).then_some(category)
}
