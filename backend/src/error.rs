use thiserror::Error;

#[derive(Error, Debug)]
pub enum KrownError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("SSH connection error: {0}")]
    Ssh(String),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("Session not found: {id}")]
    SessionNotFound { id: String },

    #[error("User not found: {username}")]
    UserNotFound { username: String },

    #[error("Permission denied")]
    PermissionDenied,

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<KrownError> for axum::response::Response {
    fn from(err: KrownError) -> Self {
        let status = match err {
            KrownError::SessionNotFound { .. } | KrownError::UserNotFound { .. } => {
                axum::http::StatusCode::NOT_FOUND
            }
            KrownError::Auth(_) | KrownError::PermissionDenied => {
                axum::http::StatusCode::UNAUTHORIZED
            }
            KrownError::InvalidInput(_) => axum::http::StatusCode::BAD_REQUEST,
            _ => axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = serde_json::json!({
            "error": err.to_string()
        });

        axum::Json(body).into_response()
    }
}

impl axum::response::IntoResponse for KrownError {
    fn into_response(self) -> axum::response::Response {
        self.into()
    }
}

