#![allow(non_snake_case)]

use tauri::State;
use vrcx_0_application::{
    build_favorites_baseline, build_friend_roster_baseline, SocialBaselineDeps,
};
use vrcx_0_core::friends::FriendRecord;

use crate::error::AppError;
use crate::state::AppState;

use vrcx_0_application::{
    SocialFavoritesBaselineInput, SocialFavoritesBaselineOutput, SocialFriendRosterBaselineInput,
    SocialFriendRosterBaselineOutput,
};

fn social_baseline_deps(state: &State<'_, AppState>) -> SocialBaselineDeps {
    SocialBaselineDeps {
        db: state.db.clone(),
        web: state.web.clone(),
        auth_scope: state.runtime_context.auth_scope.clone(),
        session: state.runtime_context.session.clone(),
    }
}

#[tauri::command]
pub async fn app__social_favorites_baseline_get(
    state: State<'_, AppState>,
    input: SocialFavoritesBaselineInput,
) -> Result<SocialFavoritesBaselineOutput, AppError> {
    let command = "app__social_favorites_baseline_get";
    let diagnostics = state.runtime_context.diagnostics.clone();
    let sync = state.runtime_context.sync.clone();
    diagnostics.record_command(command, "running", "Favorites baseline started.");

    let result = build_favorites_baseline(social_baseline_deps(&state), input)
        .await
        .map_err(AppError::from);
    match &result {
        Ok(output) => {
            let status = if output.stale { "stale" } else { "ok" };
            let sync_status = if output.stale { "stale" } else { "ready" };
            diagnostics.record_command(
                command,
                status,
                format!(
                    "user={} stale={} count={}",
                    output.user_id, output.stale, output.count
                ),
            );
            sync.record(
                "favorites",
                sync_status,
                if output.stale {
                    format!(
                        "Favorites baseline skipped stale request for {}.",
                        output.user_id
                    )
                } else {
                    format!("Favorites baseline loaded for {}.", output.user_id)
                },
                0,
            );
        }
        Err(error) => {
            diagnostics.record_command(command, "error", error.to_string());
            sync.record_failure("favorites", error.to_string());
        }
    }

    result
}

#[tauri::command]
pub async fn app__social_friend_roster_baseline_get(
    state: State<'_, AppState>,
    input: SocialFriendRosterBaselineInput,
) -> Result<SocialFriendRosterBaselineOutput, AppError> {
    let command = "app__social_friend_roster_baseline_get";
    let diagnostics = state.runtime_context.diagnostics.clone();
    let sync = state.runtime_context.sync.clone();
    let baseline_started_ms = chrono::Utc::now().timestamp_millis();
    let input_endpoint = input.endpoint.clone();
    let input_websocket = input.websocket.clone();
    diagnostics.record_command(command, "running", "Friend roster baseline started.");

    let result = build_friend_roster_baseline(social_baseline_deps(&state), input)
        .await
        .map_err(AppError::from);
    match &result {
        Ok(output) => {
            if !output.stale {
                if let Some(snapshot) = output.snapshot.as_ref() {
                    let friends_value = snapshot
                        .as_value()
                        .get("friendsById")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({}));
                    match serde_json::from_value::<std::collections::HashMap<String, FriendRecord>>(
                        friends_value,
                    ) {
                        Ok(friends_by_id) => {
                            if let Err(error) =
                                state.realtime_runtime.sync_friend_snapshot_with_started_at(
                                    output.user_id.clone(),
                                    input_endpoint.clone(),
                                    input_websocket.clone(),
                                    None,
                                    baseline_started_ms,
                                    friends_by_id,
                                )
                            {
                                tracing::warn!(
                                    "Friend roster baseline realtime cache sync failed: {error}"
                                );
                            }
                        }
                        Err(error) => {
                            tracing::warn!(
                                "Friend roster baseline friendsById decode failed: {error}"
                            );
                        }
                    }
                }
            }
            let status = if output.stale { "stale" } else { "ok" };
            let sync_status = if output.stale { "stale" } else { "ready" };
            diagnostics.record_command(
                command,
                status,
                format!(
                    "user={} stale={} count={}",
                    output.user_id, output.stale, output.count
                ),
            );
            sync.record(
                "friends",
                sync_status,
                if output.stale {
                    format!(
                        "Friend roster baseline skipped stale request for {}.",
                        output.user_id
                    )
                } else {
                    format!("Friend roster baseline loaded for {}.", output.user_id)
                },
                0,
            );
        }
        Err(error) => {
            diagnostics.record_command(command, "error", error.to_string());
            sync.record_failure("friends", error.to_string());
        }
    }

    result
}
