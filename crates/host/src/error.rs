#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Custom(String),
}

impl From<vrcx_0_core::vrchat_registry_policy::RegistryPolicyError> for Error {
    fn from(value: vrcx_0_core::vrchat_registry_policy::RegistryPolicyError) -> Self {
        use vrcx_0_core::vrchat_registry_policy::RegistryPolicyError;
        match value {
            RegistryPolicyError::Json(error) => Self::Json(error),
            RegistryPolicyError::Invalid(message) => Self::Custom(message),
        }
    }
}
