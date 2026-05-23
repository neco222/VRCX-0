#![allow(non_snake_case)]

use serde_json::Value;
use tauri::State;
use vrcx_0_application::vrchat_api::auth::{
    config_get_input, current_user_get_input, email_otp_verify_input, file_analysis_get_input,
    login_basic_input, otp_verify_input, session_get_input, totp_verify_input, visits_get_input,
};

use crate::error::AppError;
use crate::state::AppState;
use vrcx_0_application::vrchat_api::{VrchatApiRequest, VrchatApiResponse};
use vrcx_0_application::{
    LoginSuccessRecordInput, LogoutRecordInput, SavedCredentialLoginStartInput,
};

use super::types::{
    VrchatAuthCodeInput, VrchatAuthEndpointInput, VrchatAuthFileAnalysisInput,
    VrchatAuthLoginBasicInput, VrchatAuthLoginSuccessRecordInput, VrchatAuthLogoutRecordInput,
    VrchatAuthSavedCredentialDeleteInput, VrchatAuthSavedCredentialLoginStartInput,
};

async fn execute_auth_api(
    state: State<'_, AppState>,
    command: &str,
    detail: impl Into<String>,
    input: VrchatApiRequest,
) -> Result<VrchatApiResponse, AppError> {
    let diagnostics = state.runtime_context.diagnostics.clone();
    diagnostics.record_command(command, "running", detail.into());
    let result = super::super::execute::execute_vrchat_auth_api(state, input).await;
    match &result {
        Ok(response) => {
            diagnostics.record_command(command, "ok", format!("status={}", response.status));
        }
        Err(error) => diagnostics.record_command(command, "error", error.to_string()),
    }
    result
}

#[tauri::command]
pub fn app__vrchat_auth_saved_snapshot_get(state: State<'_, AppState>) -> Result<Value, AppError> {
    vrcx_0_application::saved_snapshot(&state.runtime_context.config).map_err(AppError::from)
}

#[tauri::command]
pub fn app__vrchat_auth_saved_credential_delete(
    state: State<'_, AppState>,
    input: VrchatAuthSavedCredentialDeleteInput,
) -> Result<Value, AppError> {
    vrcx_0_application::delete_saved_credential(&state.runtime_context.config, input.user_id)
        .map_err(AppError::from)
}

#[tauri::command]
pub async fn app__vrchat_auth_saved_credential_login_start(
    state: State<'_, AppState>,
    input: VrchatAuthSavedCredentialLoginStartInput,
) -> Result<VrchatApiResponse, AppError> {
    let diagnostics = state.runtime_context.diagnostics.clone();
    diagnostics.record_command(
        "app__vrchat_auth_saved_credential_login_start",
        "running",
        format!("Logging in saved credential {}.", input.user_id),
    );
    let result = vrcx_0_application::saved_credential_login_start(
        &state.runtime_context.config,
        state.web.as_ref(),
        state.db.as_ref(),
        SavedCredentialLoginStartInput {
            user_id: input.user_id,
            endpoint: input.endpoint,
        },
    )
    .await
    .map_err(AppError::from);
    match &result {
        Ok(response) => diagnostics.record_command(
            "app__vrchat_auth_saved_credential_login_start",
            "ok",
            format!("status={}", response.status),
        ),
        Err(error) => diagnostics.record_command(
            "app__vrchat_auth_saved_credential_login_start",
            "error",
            error.to_string(),
        ),
    }
    result
}

#[tauri::command]
pub fn app__vrchat_auth_login_success_record(
    state: State<'_, AppState>,
    input: VrchatAuthLoginSuccessRecordInput,
) -> Result<Value, AppError> {
    vrcx_0_application::record_login_success(
        &state.runtime_context.config,
        state.web.as_ref(),
        LoginSuccessRecordInput {
            user: input.user,
            login_params: input.login_params,
            stored_login_params: input.stored_login_params,
            save_credentials: input.save_credentials,
        },
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn app__vrchat_auth_logout_record(
    state: State<'_, AppState>,
    input: VrchatAuthLogoutRecordInput,
) -> Result<Value, AppError> {
    vrcx_0_application::record_logout(
        &state.runtime_context.config,
        state.web.as_ref(),
        LogoutRecordInput {
            user_or_user_id: input.user_or_user_id,
            clear_last_user_logged_in: input.clear_last_user_logged_in,
            cookies: input.cookies,
        },
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub async fn app__vrchat_auth_config_get(
    state: State<'_, AppState>,
    input: VrchatAuthEndpointInput,
) -> Result<VrchatApiResponse, AppError> {
    execute_auth_api(
        state,
        "app__vrchat_auth_config_get",
        "Getting VRChat config.",
        config_get_input(input.endpoint),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_current_user_get(
    state: State<'_, AppState>,
    input: VrchatAuthEndpointInput,
) -> Result<VrchatApiResponse, AppError> {
    execute_auth_api(
        state,
        "app__vrchat_auth_current_user_get",
        "Getting current VRChat user.",
        current_user_get_input(input.endpoint),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_session_get(
    state: State<'_, AppState>,
    input: VrchatAuthEndpointInput,
) -> Result<VrchatApiResponse, AppError> {
    execute_auth_api(
        state,
        "app__vrchat_auth_session_get",
        "Getting VRChat auth session.",
        session_get_input(input.endpoint),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_login_basic(
    state: State<'_, AppState>,
    input: VrchatAuthLoginBasicInput,
) -> Result<VrchatApiResponse, AppError> {
    let (username, request) = login_basic_input(
        input.endpoint,
        input.username,
        input.password,
        "VrchatAuthLoginBasic requires username.",
        "VrchatAuthLoginBasic requires password.",
    )?;
    execute_auth_api(
        state,
        "app__vrchat_auth_login_basic",
        format!("Logging in {username}."),
        request,
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_cookie_session_restore(
    state: State<'_, AppState>,
    input: VrchatAuthEndpointInput,
) -> Result<VrchatApiResponse, AppError> {
    let endpoint = input.endpoint;
    let config_response = execute_auth_api(
        state.clone(),
        "app__vrchat_auth_cookie_session_restore_config",
        "Preparing VRChat config before cookie session restore.",
        config_get_input(endpoint.clone()),
    )
    .await?;
    if config_response.status == 403 {
        return Ok(config_response);
    }

    execute_auth_api(
        state,
        "app__vrchat_auth_cookie_session_restore",
        "Restoring current VRChat user from cookies.",
        current_user_get_input(endpoint),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_login_basic_start(
    state: State<'_, AppState>,
    input: VrchatAuthLoginBasicInput,
) -> Result<VrchatApiResponse, AppError> {
    let endpoint = input.endpoint;
    let (username, request) = login_basic_input(
        endpoint.clone(),
        input.username,
        input.password,
        "VrchatAuthLoginBasicStart requires username.",
        "VrchatAuthLoginBasicStart requires password.",
    )?;
    let config_response = execute_auth_api(
        state.clone(),
        "app__vrchat_auth_login_basic_start_config",
        "Preparing VRChat config before basic login.",
        config_get_input(endpoint.clone()),
    )
    .await?;
    if config_response.status == 403 {
        return Ok(config_response);
    }
    execute_auth_api(
        state,
        "app__vrchat_auth_login_basic_start",
        format!("Logging in {username}."),
        request,
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_totp_verify(
    state: State<'_, AppState>,
    input: VrchatAuthCodeInput,
) -> Result<VrchatApiResponse, AppError> {
    execute_auth_api(
        state,
        "app__vrchat_auth_totp_verify",
        "Verifying VRChat TOTP.",
        totp_verify_input(input.endpoint, input.code),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_otp_verify(
    state: State<'_, AppState>,
    input: VrchatAuthCodeInput,
) -> Result<VrchatApiResponse, AppError> {
    execute_auth_api(
        state,
        "app__vrchat_auth_otp_verify",
        "Verifying VRChat OTP.",
        otp_verify_input(input.endpoint, input.code),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_email_otp_verify(
    state: State<'_, AppState>,
    input: VrchatAuthCodeInput,
) -> Result<VrchatApiResponse, AppError> {
    execute_auth_api(
        state,
        "app__vrchat_auth_email_otp_verify",
        "Verifying VRChat email OTP.",
        email_otp_verify_input(input.endpoint, input.code),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_visits_get(
    state: State<'_, AppState>,
    input: VrchatAuthEndpointInput,
) -> Result<VrchatApiResponse, AppError> {
    execute_auth_api(
        state,
        "app__vrchat_auth_visits_get",
        "Getting online visits.",
        visits_get_input(input.endpoint),
    )
    .await
}

#[tauri::command]
pub async fn app__vrchat_auth_file_analysis_get(
    state: State<'_, AppState>,
    input: VrchatAuthFileAnalysisInput,
) -> Result<VrchatApiResponse, AppError> {
    let (file_id, request) =
        file_analysis_get_input(input.endpoint, input.file_id, input.version, input.variant)?;
    execute_auth_api(
        state,
        "app__vrchat_auth_file_analysis_get",
        format!("Getting file analysis for {file_id}."),
        request,
    )
    .await
}
