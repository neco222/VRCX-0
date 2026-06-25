use serde::{Deserialize, Serialize};
use serde_json::Value;
use vrcx_0_core::json::RawJson;
use vrcx_0_persistence::cache_entities::CacheEntityInput;
use vrcx_0_persistence::DatabaseService;

use crate::diagnostics::RuntimeDiagnostics;
use crate::sync::RuntimeSyncEngine;
use crate::vrchat_api::favorites::{favorite_add_input, favorite_delete_input};
use crate::vrchat_api::{execute_api_command, normalize_text, VrchatScope};
use crate::web_client::WebClient;
use crate::{Error, Result};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FavoriteTransferLocation {
    Remote,
    Local,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteTransferSource {
    pub location: FavoriteTransferLocation,
    #[serde(default)]
    pub group: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteTransferTarget {
    pub location: FavoriteTransferLocation,
    #[serde(default)]
    pub group: String,
    #[serde(default)]
    pub favorite_type: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteTransferItem {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub entity_id: String,
    #[serde(default)]
    pub entity: Option<RawJson>,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteTransferInput {
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub kind: String,
    pub source: FavoriteTransferSource,
    pub target: FavoriteTransferTarget,
    #[serde(default)]
    pub items: Vec<FavoriteTransferItem>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FavoriteTransferStage {
    Validate,
    DeleteRemote,
    AddRemote,
    AddLocal,
    MoveLocal,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FavoriteTransferItemStatus {
    Moved,
    Copied,
    Failed,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteTransferItemResult {
    pub key: String,
    pub entity_id: String,
    pub status: FavoriteTransferItemStatus,
    pub stage: FavoriteTransferStage,
    pub message: String,
    pub remote_favorite: Option<RawJson>,
    pub local_affected: i64,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteTransferResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub local_changed: bool,
    pub items: Vec<FavoriteTransferItemResult>,
}

pub struct FavoriteTransferDeps<'a> {
    pub db: &'a DatabaseService,
    pub web: &'a WebClient,
    pub diagnostics: &'a RuntimeDiagnostics,
    pub sync: &'a RuntimeSyncEngine,
}

pub fn favorite_transfer_plan_for_item(
    input: &FavoriteTransferInput,
    item: &FavoriteTransferItem,
) -> Result<Vec<FavoriteTransferStage>> {
    let kind = normalize_favorite_kind(&input.kind)?;
    let source_group = normalize_text(&input.source.group);
    let target_group = normalize_text(&input.target.group);
    let entity_id = normalize_text(&item.entity_id);

    if target_group.is_empty() {
        return Err(Error::Custom(
            "Favorite transfer requires target group.".into(),
        ));
    }
    if entity_id.is_empty() {
        return Err(Error::Custom(
            "Favorite transfer requires entity id.".into(),
        ));
    }
    if input.source.location == input.target.location && source_group == target_group {
        return Err(Error::Custom(
            "Favorite transfer target is the same favorite group.".into(),
        ));
    }
    if input.target.location == FavoriteTransferLocation::Remote
        && remote_favorite_type(input, kind).is_empty()
    {
        return Err(Error::Custom(
            "Favorite transfer requires remote favorite type.".into(),
        ));
    }

    let stages = match (input.source.location, input.target.location) {
        (FavoriteTransferLocation::Remote, FavoriteTransferLocation::Remote) => {
            vec![
                FavoriteTransferStage::DeleteRemote,
                FavoriteTransferStage::AddRemote,
            ]
        }
        (FavoriteTransferLocation::Remote, FavoriteTransferLocation::Local) => {
            vec![
                FavoriteTransferStage::DeleteRemote,
                FavoriteTransferStage::AddLocal,
            ]
        }
        (FavoriteTransferLocation::Local, FavoriteTransferLocation::Remote) => {
            vec![FavoriteTransferStage::AddRemote]
        }
        (FavoriteTransferLocation::Local, FavoriteTransferLocation::Local) => {
            vec![FavoriteTransferStage::MoveLocal]
        }
    };

    Ok(stages)
}

pub async fn transfer_favorites(
    deps: FavoriteTransferDeps<'_>,
    input: FavoriteTransferInput,
) -> Result<FavoriteTransferResult> {
    let mut item_results = Vec::with_capacity(input.items.len());
    let mut succeeded = 0;
    let mut failed = 0;
    let mut local_changed = false;

    for item in &input.items {
        let result = transfer_item(&deps, &input, item).await;
        match result.status {
            FavoriteTransferItemStatus::Moved | FavoriteTransferItemStatus::Copied => {
                succeeded += 1;
                local_changed = local_changed || item_result_changed_local(&result);
            }
            FavoriteTransferItemStatus::Failed => {
                failed += 1;
            }
        }
        item_results.push(result);
    }

    Ok(FavoriteTransferResult {
        total: item_results.len(),
        succeeded,
        failed,
        local_changed,
        items: item_results,
    })
}

async fn transfer_item(
    deps: &FavoriteTransferDeps<'_>,
    input: &FavoriteTransferInput,
    item: &FavoriteTransferItem,
) -> FavoriteTransferItemResult {
    let key = item.key.clone();
    let entity_id = normalize_text(&item.entity_id);
    let steps = match favorite_transfer_plan_for_item(input, item) {
        Ok(steps) => steps,
        Err(error) => {
            return failed_item_result(key, entity_id, FavoriteTransferStage::Validate, error);
        }
    };

    let mut remote_favorite = None;
    let mut local_affected = 0;
    for stage in steps {
        let step_result = match stage {
            FavoriteTransferStage::DeleteRemote => delete_remote_favorite(deps, input, item).await,
            FavoriteTransferStage::AddRemote => {
                add_remote_favorite(deps, input, item)
                    .await
                    .map(|favorite| {
                        remote_favorite = Some(favorite);
                        0
                    })
            }
            FavoriteTransferStage::AddLocal => add_local_favorite(deps, input, item),
            FavoriteTransferStage::MoveLocal => move_local_favorite(deps, input, item),
            FavoriteTransferStage::Validate => Ok(0),
        };

        match step_result {
            Ok(affected) => {
                local_affected += affected;
            }
            Err(error) => {
                return failed_item_result(key, entity_id, stage, error);
            }
        }
    }

    FavoriteTransferItemResult {
        key,
        entity_id,
        status: transfer_success_status(input),
        stage: last_success_stage(input),
        message: String::new(),
        remote_favorite,
        local_affected,
    }
}

async fn delete_remote_favorite(
    deps: &FavoriteTransferDeps<'_>,
    input: &FavoriteTransferInput,
    item: &FavoriteTransferItem,
) -> Result<i64> {
    let object_id = normalize_text(&item.entity_id);
    let (_, request) = favorite_delete_input(input.endpoint.clone(), object_id)
        .map_err(|error| Error::Custom(error.to_string()))?;
    let response = execute_api_command(
        deps.web,
        deps.db,
        deps.diagnostics,
        deps.sync,
        "app__favorites_transfer.delete_remote",
        request,
        VrchatScope::Vrchat,
    )
    .await?;
    ensure_vrchat_response_ok(response.status, &response.data, "delete remote favorite")?;
    Ok(0)
}

async fn add_remote_favorite(
    deps: &FavoriteTransferDeps<'_>,
    input: &FavoriteTransferInput,
    item: &FavoriteTransferItem,
) -> Result<RawJson> {
    let kind = normalize_favorite_kind(&input.kind)?;
    let favorite_type = remote_favorite_type(input, kind);
    let target_group = normalize_text(&input.target.group);
    let (_, _, request) = favorite_add_input(
        input.endpoint.clone(),
        favorite_type,
        normalize_text(&item.entity_id),
        target_group,
    )
    .map_err(|error| Error::Custom(error.to_string()))?;
    let response = execute_api_command(
        deps.web,
        deps.db,
        deps.diagnostics,
        deps.sync,
        "app__favorites_transfer.add_remote",
        request,
        VrchatScope::Vrchat,
    )
    .await?;
    ensure_vrchat_response_ok(response.status, &response.data, "add remote favorite")?;
    Ok(RawJson::from(parse_response_json(&response.data)))
}

fn add_local_favorite(
    deps: &FavoriteTransferDeps<'_>,
    input: &FavoriteTransferInput,
    item: &FavoriteTransferItem,
) -> Result<i64> {
    let affected = vrcx_0_persistence::favorites::favorite_add(
        deps.db,
        normalize_favorite_kind(&input.kind)?.to_string(),
        normalize_text(&item.entity_id),
        normalize_text(&input.target.group),
    )?;
    if let Err(error) = cache_world_snapshot_if_safe(deps.db, input, item) {
        tracing::warn!("failed to cache transferred favorite world snapshot: {error}");
    }
    Ok(affected)
}

fn move_local_favorite(
    deps: &FavoriteTransferDeps<'_>,
    input: &FavoriteTransferInput,
    item: &FavoriteTransferItem,
) -> Result<i64> {
    let result = vrcx_0_persistence::favorites::favorite_move(
        deps.db,
        normalize_favorite_kind(&input.kind)?.to_string(),
        normalize_text(&item.entity_id),
        normalize_text(&input.source.group),
        normalize_text(&input.target.group),
    )?;
    Ok(result.removed + result.added)
}

fn failed_item_result(
    key: String,
    entity_id: String,
    stage: FavoriteTransferStage,
    error: Error,
) -> FavoriteTransferItemResult {
    FavoriteTransferItemResult {
        key,
        entity_id,
        status: FavoriteTransferItemStatus::Failed,
        stage,
        message: error.to_string(),
        remote_favorite: None,
        local_affected: 0,
    }
}

fn transfer_success_status(input: &FavoriteTransferInput) -> FavoriteTransferItemStatus {
    if input.source.location == FavoriteTransferLocation::Local
        && input.target.location == FavoriteTransferLocation::Remote
    {
        FavoriteTransferItemStatus::Copied
    } else {
        FavoriteTransferItemStatus::Moved
    }
}

fn last_success_stage(input: &FavoriteTransferInput) -> FavoriteTransferStage {
    match (input.source.location, input.target.location) {
        (FavoriteTransferLocation::Remote, FavoriteTransferLocation::Remote) => {
            FavoriteTransferStage::AddRemote
        }
        (FavoriteTransferLocation::Remote, FavoriteTransferLocation::Local) => {
            FavoriteTransferStage::AddLocal
        }
        (FavoriteTransferLocation::Local, FavoriteTransferLocation::Remote) => {
            FavoriteTransferStage::AddRemote
        }
        (FavoriteTransferLocation::Local, FavoriteTransferLocation::Local) => {
            FavoriteTransferStage::MoveLocal
        }
    }
}

fn item_result_changed_local(result: &FavoriteTransferItemResult) -> bool {
    matches!(
        result.stage,
        FavoriteTransferStage::AddLocal | FavoriteTransferStage::MoveLocal
    ) && result.local_affected > 0
}

fn normalize_favorite_kind(kind: &str) -> Result<&'static str> {
    match kind.trim() {
        "friend" => Ok("friend"),
        "avatar" => Ok("avatar"),
        "world" => Ok("world"),
        _ => Err(Error::Custom("unsupported favorite kind".into())),
    }
}

fn remote_favorite_type(input: &FavoriteTransferInput, kind: &str) -> String {
    let favorite_type = normalize_text(&input.target.favorite_type);
    if favorite_type.is_empty() {
        kind.to_string()
    } else {
        favorite_type
    }
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    let value = normalize_text(value.unwrap_or_default());
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn ensure_vrchat_response_ok(status: i32, data: &str, action: &str) -> Result<()> {
    if status < 400 {
        return Ok(());
    }

    let parsed = parse_response_json(data);
    let message = parsed
        .get("error")
        .and_then(Value::as_object)
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| parsed.get("message").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_else(|| format!("VRChat favorite transfer failed during {action}."));
    Err(Error::Custom(message))
}

fn parse_response_json(data: &str) -> Value {
    serde_json::from_str(data).unwrap_or_else(|_| Value::String(data.to_string()))
}

fn cache_world_snapshot_if_safe(
    db: &DatabaseService,
    input: &FavoriteTransferInput,
    item: &FavoriteTransferItem,
) -> Result<()> {
    if normalize_favorite_kind(&input.kind)? != "world" {
        return Ok(());
    }
    let Some(entity) = item.entity.as_ref().map(RawJson::as_value) else {
        return Ok(());
    };
    let Some(entry) = build_public_world_cache_entry(entity, &item.entity_id) else {
        return Ok(());
    };
    vrcx_0_persistence::worlds::world_cache_upsert(db, entry)?;
    Ok(())
}

fn build_public_world_cache_entry(
    world: &Value,
    fallback_world_id: &str,
) -> Option<CacheEntityInput> {
    let id = string_field(world, &["id"])
        .or_else(|| normalize_optional_text(Some(fallback_world_id)))?;
    let release_status = string_field(world, &["releaseStatus"])?;
    if release_status.to_lowercase() != "public" {
        return None;
    }
    let name = string_field(world, &["name"])?;
    let thumbnail_image_url = string_field(world, &["thumbnailImageUrl"]);
    let image_url = string_field(world, &["imageUrl"]);
    if thumbnail_image_url
        .as_deref()
        .unwrap_or_default()
        .is_empty()
        && image_url.as_deref().unwrap_or_default().is_empty()
    {
        return None;
    }

    Some(CacheEntityInput {
        id: Value::String(id),
        author_id: string_value(world, &["authorId"]),
        author_name: string_value(world, &["authorName"]),
        created_at: string_value(world, &["created_at", "createdAt"]),
        description: string_value(world, &["description"]),
        image_url: Value::String(image_url.unwrap_or_default()),
        name: Value::String(name),
        release_status: Value::String(release_status),
        thumbnail_image_url: Value::String(thumbnail_image_url.unwrap_or_default()),
        updated_at: string_value(world, &["updated_at", "updatedAt"]),
        version: world.get("version").cloned().unwrap_or(Value::Null),
    })
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        let text = match value.get(*key) {
            Some(Value::String(text)) => normalize_text(text),
            Some(other) if !other.is_null() => normalize_text(other.to_string()),
            _ => String::new(),
        };
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

fn string_value(value: &Value, keys: &[&str]) -> Value {
    Value::String(string_field(value, keys).unwrap_or_default())
}
