use vrcx_0_application::{OverlayActivityCategory, OverlayActivityEntry, OverlayActivitySnapshot};
use vrcx_0_host::vr_overlay::{VrDeviceSnapshot, VrDeviceStatus};
use vrcx_0_vr_overlay::{
    Color, DeviceChip, DeviceStatus, FeedKind, FeedLine, FeedSeverity, OverlayFooter, OverlaySize,
    WristSurfaceModel,
};

const MAX_FEED_ROWS: usize = 10;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum WristOverlaySizePreset {
    Compact,
    #[default]
    Normal,
    Large,
}

impl WristOverlaySizePreset {
    pub fn from_config(value: &str) -> Self {
        match value.trim() {
            "compact" => Self::Compact,
            "large" => Self::Large,
            _ => Self::Normal,
        }
    }

    pub fn as_config(self) -> &'static str {
        match self {
            Self::Compact => "compact",
            Self::Normal => "normal",
            Self::Large => "large",
        }
    }

    pub fn overlay_size(self) -> OverlaySize {
        match self {
            Self::Compact => OverlaySize::new(448, 448),
            Self::Normal => OverlaySize::new(512, 512),
            Self::Large => OverlaySize::new(640, 640),
        }
    }

    pub fn physical_width_meters(self) -> f32 {
        match self {
            Self::Compact => 0.16,
            Self::Normal => 0.20,
            Self::Large => 0.24,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WristOverlayRenderOptions {
    pub size: WristOverlaySizePreset,
    pub hide_private_worlds: bool,
    pub dark_background: bool,
    pub show_devices: bool,
    pub show_battery_percent: bool,
}

impl Default for WristOverlayRenderOptions {
    fn default() -> Self {
        Self {
            size: WristOverlaySizePreset::Normal,
            hide_private_worlds: false,
            dark_background: true,
            show_devices: true,
            show_battery_percent: false,
        }
    }
}

pub struct WristOverlayFrameInput {
    pub activity: OverlayActivitySnapshot,
    pub devices: Vec<VrDeviceSnapshot>,
    pub footer: WristRuntimeFooter,
    pub options: WristOverlayRenderOptions,
    pub captured_at_ms: i64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WristRuntimeFooter {
    pub player_count: u32,
    pub instance_duration: String,
    pub local_time: [u8; 5],
}

pub fn build_wrist_surface_model(input: WristOverlayFrameInput) -> WristSurfaceModel {
    let feed_rows = input
        .activity
        .entries
        .iter()
        .rev()
        .filter(|entry| !should_hide_private_world(entry, input.options.hide_private_worlds))
        .take(MAX_FEED_ROWS)
        .map(feed_line_from_activity)
        .collect();
    WristSurfaceModel {
        size: input.options.size.overlay_size(),
        dark_background: input.options.dark_background,
        show_battery_percent: input.options.show_battery_percent,
        devices: if input.options.show_devices {
            input
                .devices
                .into_iter()
                .map(device_chip_from_snapshot)
                .collect()
        } else {
            Vec::new()
        },
        feed_rows,
        footer: OverlayFooter {
            left: format!("{} players", input.footer.player_count),
            center: input.footer.instance_duration,
            right: String::from_utf8_lossy(&input.footer.local_time).to_string(),
        },
        accent: Color::rgba(94, 234, 212, 255),
        captured_at_ms: input.captured_at_ms,
    }
}

fn device_chip_from_snapshot(snapshot: VrDeviceSnapshot) -> DeviceChip {
    let status = match snapshot.status {
        VrDeviceStatus::Normal => DeviceStatus::Normal,
        VrDeviceStatus::LowBattery => DeviceStatus::LowBattery,
        VrDeviceStatus::CriticalBattery => DeviceStatus::CriticalBattery,
        VrDeviceStatus::Charging => DeviceStatus::Charging,
        VrDeviceStatus::TrackingWarning => DeviceStatus::TrackingWarning,
        VrDeviceStatus::Disconnected => DeviceStatus::Disconnected,
    };
    let text = match (snapshot.battery_percent, snapshot.status) {
        (Some(percent), VrDeviceStatus::LowBattery) => format!("{percent} low"),
        (Some(percent), VrDeviceStatus::CriticalBattery) => format!("{percent} crit"),
        (Some(percent), VrDeviceStatus::Charging) => format!("{percent} chg"),
        (Some(percent), VrDeviceStatus::TrackingWarning) => format!("{percent} warn"),
        (Some(percent), VrDeviceStatus::Disconnected) => format!("{percent} off"),
        (Some(percent), VrDeviceStatus::Normal) => percent.to_string(),
        (None, VrDeviceStatus::TrackingWarning) => "warn".to_string(),
        (None, VrDeviceStatus::Disconnected) => "off".to_string(),
        (None, VrDeviceStatus::Charging) => "chg".to_string(),
        (None, _) => String::new(),
    };
    let priority = match snapshot.status {
        VrDeviceStatus::CriticalBattery | VrDeviceStatus::Disconnected => 40,
        VrDeviceStatus::LowBattery | VrDeviceStatus::TrackingWarning => 30,
        VrDeviceStatus::Charging => 20,
        VrDeviceStatus::Normal => 10,
    };
    DeviceChip {
        label: snapshot.label,
        status,
        battery_percent: snapshot.battery_percent,
        text,
        priority,
    }
}

fn feed_line_from_activity(entry: &OverlayActivityEntry) -> FeedLine {
    FeedLine {
        time_text: time_text(&entry.created_at),
        kind: feed_kind(entry),
        detail: feed_detail(entry),
        severity: feed_severity(entry),
    }
}

fn feed_detail(entry: &OverlayActivityEntry) -> String {
    let summary = entry.content.summary.trim();
    let detail = entry.content.detail.trim();
    let body = entry.content.body.fallback.trim();
    let title = entry.content.title.fallback.trim();
    let actor = entry.actor_display_name.trim();
    let world_name = meaningful_world_name(entry);

    if let Some(world_name) = world_name {
        for value in [summary, detail, body] {
            let replaced = replace_location_ids(value, entry, world_name);
            if !replaced.trim().is_empty() {
                return replaced;
            }
        }
    }

    let candidate = first_non_empty([summary, detail, body, title, actor]);
    if contains_location_id(&candidate) {
        location_id_free_detail(entry, title, actor)
    } else {
        candidate
    }
}

fn meaningful_world_name(entry: &OverlayActivityEntry) -> Option<&str> {
    let world_name = entry.content.world_name.trim();
    if world_name.is_empty() || is_location_id_like(world_name) {
        None
    } else {
        Some(world_name)
    }
}

fn replace_location_ids(value: &str, entry: &OverlayActivityEntry, world_name: &str) -> String {
    let mut output = value.trim().to_string();
    let location_world_id = world_id_from_location(entry.content.location.trim());
    for location in [
        entry.content.world_name.trim(),
        entry.content.location.trim(),
        location_world_id.as_str(),
    ] {
        if is_location_id_like(location) {
            output = output.replace(location, world_name);
        }
    }
    output
}

fn location_id_free_detail(entry: &OverlayActivityEntry, title: &str, actor: &str) -> String {
    let subject = first_non_empty([title, actor]);
    match entry.activity_type.as_str() {
        "GPS" if !subject.is_empty() => format!("{subject} is in an instance"),
        "Online" if !subject.is_empty() => format!("{subject} online"),
        "invite" if !subject.is_empty() => format!("{subject} invite"),
        _ => subject,
    }
}

pub fn should_hide_private_world(entry: &OverlayActivityEntry, enabled: bool) -> bool {
    if !enabled || !is_private_filtered_activity_type(&entry.activity_type) {
        return false;
    }
    let has_visible_location =
        !entry.content.location.trim().is_empty() || !entry.content.world_name.trim().is_empty();
    has_visible_location && is_private_location(&entry.content.location)
}

fn is_private_filtered_activity_type(activity_type: &str) -> bool {
    matches!(activity_type, "GPS" | "Online" | "invite")
}

fn is_private_location(location: &str) -> bool {
    let normalized = location.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    if normalized == "private" || normalized == "private:private" {
        return true;
    }
    normalized.contains("~private(")
        || normalized.contains("~hidden(")
        || normalized.contains("~friends(")
        || normalized.contains("~group(")
}

fn contains_location_id(value: &str) -> bool {
    value
        .split_whitespace()
        .any(|part| is_location_id_like(part.trim_matches(|ch: char| ch.is_ascii_punctuation())))
}

fn is_location_id_like(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed == "private" || trimmed == "private:private" {
        return true;
    }
    trimmed.starts_with("wrld_")
}

fn world_id_from_location(location: &str) -> String {
    let trimmed = location.trim();
    if !trimmed.starts_with("wrld_") {
        return String::new();
    }
    trimmed
        .split([':', '~'])
        .next()
        .unwrap_or_default()
        .to_string()
}

fn feed_kind(entry: &OverlayActivityEntry) -> FeedKind {
    match entry.category {
        OverlayActivityCategory::ActionRequired => FeedKind::Invite,
        OverlayActivityCategory::CurrentInstance => FeedKind::Instance,
        OverlayActivityCategory::FavoriteMovement => FeedKind::Friend,
        OverlayActivityCategory::ProfileChange => FeedKind::Profile,
        OverlayActivityCategory::GroupSocial => FeedKind::Group,
        OverlayActivityCategory::SystemSafety => FeedKind::System,
        OverlayActivityCategory::Media => FeedKind::Media,
    }
}

fn feed_severity(entry: &OverlayActivityEntry) -> FeedSeverity {
    match entry.category {
        OverlayActivityCategory::ActionRequired => FeedSeverity::Important,
        OverlayActivityCategory::SystemSafety => FeedSeverity::Warning,
        _ => FeedSeverity::Normal,
    }
}

fn time_text(value: &str) -> String {
    let Some(time_start) = value.find('T').map(|index| index + 1) else {
        return String::new();
    };
    value
        .get(time_start..time_start + 5)
        .unwrap_or_default()
        .to_string()
}

fn first_non_empty<'a, I>(values: I) -> String
where
    I: IntoIterator<Item = &'a str>,
{
    values
        .into_iter()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .unwrap_or_default()
        .to_string()
}

#[cfg(test)]
mod tests {
    use serde_json::Value;
    use vrcx_0_application::{
        OverlayActivityCategory, OverlayActivityContent, OverlayActivityEntry, OverlayActivityText,
    };

    use super::*;

    #[test]
    fn hide_private_worlds_only_filters_location_bearing_gps_online_and_invites() {
        assert!(should_hide_private_world(
            &entry("GPS", "private", "Private World"),
            true
        ));
        assert!(should_hide_private_world(
            &entry("Online", "wrld_1:123~friends(usr_1)", "Friends World"),
            true
        ));
        assert!(should_hide_private_world(
            &entry("invite", "wrld_1:123~group(grp_1)", "Group World"),
            true
        ));
        assert!(!should_hide_private_world(
            &entry(
                "OnPlayerJoined",
                "wrld_1:123~friends(usr_1)",
                "Friends World"
            ),
            true
        ));
        assert!(!should_hide_private_world(
            &entry("VideoPlay", "private", "Private World"),
            true
        ));
        assert!(!should_hide_private_world(
            &entry("Online", "public", "Public World"),
            true
        ));
        assert!(!should_hide_private_world(
            &entry("invite", "private", "Private World"),
            false
        ));
    }

    #[test]
    fn feed_detail_replaces_world_id_with_meaningful_world_name() {
        let mut entry = entry("Online", "wrld_1:123", "Test World");
        entry.content.title.fallback = "Ada".to_string();
        entry.content.summary = "Ada online in wrld_1".to_string();

        assert_eq!(feed_line_from_activity(&entry).detail, "Ada online in Test World");
    }

    #[test]
    fn feed_detail_does_not_render_raw_world_id_when_world_name_is_unknown() {
        let mut entry = entry("Online", "wrld_1:123", "wrld_1");
        entry.actor_display_name = "Ada".to_string();
        entry.content.title.fallback = "Ada".to_string();
        entry.content.summary = "Ada online in wrld_1".to_string();

        assert_eq!(feed_line_from_activity(&entry).detail, "Ada online");
    }

    fn entry(activity_type: &str, location: &str, world_name: &str) -> OverlayActivityEntry {
        OverlayActivityEntry {
            sequence: 1,
            source_id: format!("source:{activity_type}"),
            activity_type: activity_type.to_string(),
            category: OverlayActivityCategory::FavoriteMovement,
            created_at: "2026-06-01T12:34:56.000Z".to_string(),
            actor_user_id: "usr_1".to_string(),
            actor_display_name: "User".to_string(),
            content: OverlayActivityContent {
                location: location.to_string(),
                world_name: world_name.to_string(),
                title: text(),
                body: text(),
                ..OverlayActivityContent::default()
            },
            payload: Value::Null,
        }
    }

    fn text() -> OverlayActivityText {
        OverlayActivityText {
            key: String::new(),
            fallback: String::new(),
            params: Value::Null,
        }
    }
}
