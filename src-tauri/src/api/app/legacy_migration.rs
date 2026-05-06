#![allow(non_snake_case)]

use tauri::{AppHandle, State};

use crate::domain::legacy_vrcx::LegacyVrcxMigrationStatus;
use crate::error::AppError;
use crate::state::AppState;

#[tauri::command]
pub fn app__check_legacy_vrcx_available(state: State<'_, AppState>) -> bool {
    state.legacy_vrcx_available
}

#[tauri::command]
pub fn app__get_legacy_vrcx_migration_status(
    state: State<'_, AppState>,
) -> LegacyVrcxMigrationStatus {
    state.legacy_vrcx_migration_status.clone()
}

#[tauri::command]
pub fn app__get_legacy_vrcx_force_migration_status() -> LegacyVrcxMigrationStatus {
    let (_, status) = crate::domain::legacy_vrcx::discover_supported_legacy_source();
    status
}

fn legacy_migration_unavailable_reason(status: &LegacyVrcxMigrationStatus) -> String {
    status
        .reason
        .clone()
        .unwrap_or_else(|| "Legacy VRCX migration is unavailable.".to_string())
}

#[tauri::command]
pub fn app__request_legacy_migration(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let Some(source) = state.legacy_vrcx_source.as_ref() else {
        return Err(AppError::Custom(legacy_migration_unavailable_reason(
            &state.legacy_vrcx_migration_status,
        )));
    };
    crate::domain::legacy_vrcx::validate_legacy_source(source).map_err(AppError::Custom)?;

    #[cfg(debug_assertions)]
    {
        tracing::warn!("app__request_legacy_migration: dev mode does not auto-restart or persist migration flag");
        let _ = (app_handle, state);
        Ok(false)
    }

    #[cfg(not(debug_assertions))]
    {
        crate::domain::legacy_migration::request_legacy_migration(&state.paths)?;
        app_handle.request_restart();
        Ok(true)
    }
}

#[tauri::command]
pub fn app__request_legacy_vrcx_force_migration(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let (source, status) = crate::domain::legacy_vrcx::discover_supported_legacy_source();
    let Some(source) = source.as_ref() else {
        return Err(AppError::Custom(legacy_migration_unavailable_reason(
            &status,
        )));
    };
    crate::domain::legacy_vrcx::validate_legacy_source(source).map_err(AppError::Custom)?;
    crate::domain::legacy_migration::request_legacy_migration(&state.paths)?;

    #[cfg(debug_assertions)]
    {
        tracing::warn!(
            "app__request_legacy_vrcx_force_migration: dev mode wrote migration flag but did not auto-restart"
        );
        let _ = app_handle;
        Ok(false)
    }

    #[cfg(not(debug_assertions))]
    {
        app_handle.request_restart();
        Ok(true)
    }
}
