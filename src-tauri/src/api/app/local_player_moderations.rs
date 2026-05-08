#![allow(non_snake_case)]

use std::collections::HashMap;

use crate::domain::local_player_moderations;
use crate::error::AppError;

use super::host_capabilities::{require_host_capability, HostCapability};

#[tauri::command]
pub fn app__get_vrchat_moderations(
    current_user_id: String,
) -> Result<HashMap<String, i16>, AppError> {
    require_host_capability(HostCapability::VrchatPathDiscovery)?;
    local_player_moderations::get_vrchat_moderations(&current_user_id)
}

#[tauri::command]
pub fn app__get_vrchat_user_moderation(
    current_user_id: String,
    user_id: String,
) -> Result<i16, AppError> {
    require_host_capability(HostCapability::VrchatPathDiscovery)?;
    local_player_moderations::get_vrchat_user_moderation(&current_user_id, &user_id)
}

#[tauri::command]
pub fn app__set_vrchat_user_moderation(
    current_user_id: String,
    user_id: String,
    moderation_type: i32,
) -> Result<bool, AppError> {
    require_host_capability(HostCapability::VrchatPathDiscovery)?;
    local_player_moderations::set_vrchat_user_moderation(
        &current_user_id,
        &user_id,
        moderation_type,
    )
}
