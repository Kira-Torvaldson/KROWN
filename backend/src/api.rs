use crate::auth::{AuthService, Claims};
use crate::config::Config;
use crate::database::Database;
use crate::error::KrownError;
use crate::models::*;
use crate::server::ServerService;
use crate::ssh::SshManager;
use crate::websocket::{websocket_handler, AppState as WsAppState, stream_handler};
use sqlx;
use axum::{
    extract::{Path, Query, State, ws::WebSocketUpgrade},
    http::HeaderMap,
    response::IntoResponse,
    routing::{get, post, delete, put},
    Json, Router,
};
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;
use std::fs;
use std::io::{BufRead, BufReader};
use tower_http::cors::{CorsLayer, AllowOrigin, AllowMethods, AllowHeaders};
use tower_http::trace::TraceLayer;
use axum::http::Method;

pub struct AppState {
    pub auth: AuthService,
    pub ssh: SshManager,
    pub server: ServerService,
    pub db: Database,
}

pub async fn start_server(config: Config, db: Database) -> anyhow::Result<()> {
    let auth = AuthService::new(db.clone(), config.clone());
    let ssh = SshManager::new(db.clone(), config.clone());
    let server = ServerService::new(db.clone());

    let app_state = Arc::new(AppState { auth, ssh, server, db });

    // WebSocket state (clone needed for WebSocket handler)
    let ws_state = Arc::new(WsAppState {
        auth: AuthService::new(db.clone(), config.clone()),
        ssh: SshManager::new(db.clone(), config.clone()),
    });

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/servers", get(list_servers).post(create_server))
        .route("/api/servers/:id", get(get_server).put(update_server).delete(delete_server))
        .route("/api/ssh/:server_id/connect", post(connect_ssh))
        .route("/api/sessions", get(list_sessions).post(create_session))
        .route("/api/sessions/:id", get(get_session).delete(delete_session))
        .route("/api/sessions/:id/execute", post(execute_command))
        .route("/api/sessions/:id/history", get(get_command_history))
        .route("/api/logs", get(get_logs))
        .route("/api/users", get(list_users))
        .route("/api/users/:id", get(get_user))
        .route("/ws", get({
            let ws_state = ws_state.clone();
            move |ws: WebSocketUpgrade| async move {
                websocket_handler(ws, State(ws_state)).await
            }
        }))
        .route("/api/ssh/:session_id/stream", get({
            let ws_state = ws_state.clone();
            move |ws: WebSocketUpgrade, Path(session_id): Path<String>| async move {
                stream_handler(ws, session_id, State(ws_state)).await
            }
        }))
        .layer({
            let cors_origins: Vec<axum::http::HeaderValue> = config.server.cors_origins
                .iter()
                .filter_map(|s| s.parse().ok())
                .collect();
            
            let cors = CorsLayer::new()
                .allow_methods(AllowMethods::list([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::OPTIONS,
                ]))
                .allow_headers(AllowHeaders::any())
                .allow_credentials(true);
            
            if cors_origins.is_empty() {
                cors.allow_origin(AllowOrigin::any())
            } else {
                cors.allow_origin(AllowOrigin::list(cors_origins))
            }
        })
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    let addr = format!("{}:{}", config.server.host, config.server.port);
    info!("Starting API server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, KrownError> {
    info!("Registration attempt for username: {}", req.username);
    match state.auth.create_user(req).await {
        Ok(user) => {
            info!("User created successfully: {}", user.username);
            Ok(Json(UserInfo::from(user)))
        }
        Err(e) => {
            warn!("Registration failed: {}", e);
            Err(e)
        }
    }
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, KrownError> {
    let response = state.auth.login(req).await?;
    Ok(Json(response))
}

async fn list_sessions(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let sessions = state.ssh.list_user_sessions(&user_id).await?;
    Ok(Json(sessions))
}

async fn create_session(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Json(req): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let session = state.ssh.create_session(user_id, req).await?;
    Ok(Json(session))
}

async fn get_session(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled
    let session_id = Uuid::parse_str(&id)
        .map_err(|_| KrownError::InvalidInput("Invalid session ID".to_string()))?;

    let session = state.ssh.get_session(&session_id).await?;
    Ok(Json(session))
}

async fn delete_session(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled
    let session_id = Uuid::parse_str(&id)
        .map_err(|_| KrownError::InvalidInput("Invalid session ID".to_string()))?;

    state.ssh.close_session(session_id).await?;
    Ok(Json(serde_json::json!({ "status": "deleted" })))
}

async fn execute_command(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<ExecuteCommandRequest>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled
    let session_id = Uuid::parse_str(&id)
        .map_err(|_| KrownError::InvalidInput("Invalid session ID".to_string()))?;

    let execution = state.ssh.execute_command(session_id, req).await?;
    Ok(Json(execution))
}

async fn list_users(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled

    let rows = sqlx::query(
        r#"
        SELECT id, username, email, role, created_at, updated_at, last_login
        FROM users
        "#,
    )
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| KrownError::Database(e))?;

    let users: Vec<UserInfo> = rows
        .into_iter()
        .map(|row| UserInfo {
            id: Uuid::parse_str(row.get::<String, _>("id")).unwrap(),
            username: row.get("username"),
            email: row.get("email"),
            role: match row.get::<String, _>("role").as_str() {
                "admin" => UserRole::Admin,
                "operator" => UserRole::Operator,
                "readonly" => UserRole::ReadOnly,
                _ => UserRole::ReadOnly,
            },
        })
        .collect();

    Ok(Json(users))
}

async fn get_user(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled
    let user = state.auth.get_user_by_id(&id).await?;
    Ok(Json(UserInfo::from(user)))
}

// Authentication disabled - use default user instead
async fn get_or_create_default_user(state: &AppState) -> Result<Uuid, KrownError> {
    // Try to find default user
    let row = sqlx::query(
        r#"SELECT id FROM users WHERE username = 'default' LIMIT 1"#
    )
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| KrownError::Database(e))?;

    if let Some(row) = row {
        let user_id_str: String = row.get("id");
        return Uuid::parse_str(&user_id_str)
            .map_err(|_| KrownError::Internal("Invalid user ID in database".to_string()));
    }

    // Create default user if doesn't exist
    let user_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    
    sqlx::query(
        r#"
        INSERT INTO users (id, username, password_hash, email, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(user_id.to_string())
    .bind("default")
    .bind("") // No password needed
    .bind(None::<String>)
    .bind("admin") // Default user is admin
    .bind(now.to_rfc3339())
    .bind(now.to_rfc3339())
    .execute(state.db.pool())
    .await
    .map_err(|e| KrownError::Database(e))?;

    info!("Default user created: {}", user_id);
    Ok(user_id)
}

// Server endpoints
async fn list_servers(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let servers = state.server.list_servers(&user_id).await?;
    Ok(Json(servers))
}

async fn create_server(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Json(req): Json<CreateServerRequest>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let server = state.server.create_server(user_id, req).await?;
    Ok(Json(server))
}

async fn get_server(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let server_id = Uuid::parse_str(&id)
        .map_err(|_| KrownError::InvalidInput("Invalid server ID".to_string()))?;
    let server = state.server.get_server(&server_id, &user_id).await?;
    Ok(Json(server))
}

async fn update_server(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateServerRequest>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let server_id = Uuid::parse_str(&id)
        .map_err(|_| KrownError::InvalidInput("Invalid server ID".to_string()))?;
    let server = state.server.update_server(&server_id, &user_id, req).await?;
    Ok(Json(server))
}

async fn delete_server(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let server_id = Uuid::parse_str(&id)
        .map_err(|_| KrownError::InvalidInput("Invalid server ID".to_string()))?;
    state.server.delete_server(&server_id, &user_id).await?;
    Ok(Json(serde_json::json!({ "status": "deleted" })))
}

async fn connect_ssh(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(server_id): Path<String>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - use default user
    let user_id = get_or_create_default_user(&state).await?;
    let server_uuid = Uuid::parse_str(&server_id)
        .map_err(|_| KrownError::InvalidInput("Invalid server ID".to_string()))?;

    // Get server with credentials
    let server = state.server.get_server_with_credentials(&server_uuid, &user_id).await?;

    // Create session request from server
    let auth_method = if server.auth_method == "password" {
        AuthMethod::Password {
            password: server.password.unwrap_or_default(),
        }
    } else {
        AuthMethod::Key {
            private_key: server.private_key.unwrap_or_default(),
            passphrase: server.passphrase,
        }
    };

    let session_req = CreateSessionRequest {
        host: server.host,
        port: Some(server.port),
        username: server.username,
        auth_method,
    };

    let session = state.ssh.create_session(user_id, session_req).await?;
    Ok(Json(session))
}

async fn get_command_history(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled
    let session_id = Uuid::parse_str(&id)
        .map_err(|_| KrownError::InvalidInput("Invalid session ID".to_string()))?;

    let rows = sqlx::query(
        r#"
        SELECT id, session_id, command, stdout, stderr, exit_code, executed_at, duration_ms
        FROM command_logs WHERE session_id = ? ORDER BY executed_at DESC
        "#,
    )
    .bind(session_id.to_string())
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| KrownError::Database(e))?;

    let commands: Result<Vec<CommandLog>, _> = rows
        .into_iter()
        .map(|row| {
            Ok(CommandLog {
                id: Uuid::parse_str(row.get::<String, _>("id"))?,
                session_id: Uuid::parse_str(row.get::<String, _>("session_id"))?,
                command: row.get("command"),
                stdout: row.get("stdout"),
                stderr: row.get("stderr"),
                exit_code: row.get::<Option<i64>, _>("exit_code").map(|c| c as i32),
                executed_at: chrono::DateTime::parse_from_rfc3339(row.get("executed_at"))
                    .unwrap()
                    .with_timezone(&chrono::Utc),
                duration_ms: row.get::<i64, _>("duration_ms") as u64,
            })
        })
        .collect();

    Ok(Json(commands.map_err(|e: uuid::Error| {
        KrownError::Internal(format!("UUID parsing error: {}", e))
    })?))
}

// Logs endpoint
async fn get_logs(
    State(state): State<Arc<AppState>>,
    _headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, KrownError> {
    // Authentication disabled - logs accessible to all

    let log_file = params.get("file").unwrap_or(&"krown.log".to_string());
    let lines: usize = params
        .get("lines")
        .and_then(|s| s.parse().ok())
        .unwrap_or(100)
        .min(1000); // Max 1000 lines

    // Security: Only allow reading from current directory
    let log_path = std::path::Path::new(log_file);
    
    // Prevent directory traversal - only allow simple filenames
    if log_path.parent().is_some() && log_path.parent() != Some(std::path::Path::new("")) {
        return Err(KrownError::InvalidInput("Invalid log file path".to_string()));
    }
    
    if !log_path.exists() {
        return Ok(Json(serde_json::json!({
            "logs": [],
            "message": "Log file not found"
        })));
    }

    let file = fs::File::open(log_path)
        .map_err(|e| KrownError::Internal(format!("Failed to open log file: {}", e)))?;
    
    let reader = BufReader::new(file);
    let all_lines: Vec<String> = reader.lines().collect::<Result<_, _>>()
        .map_err(|e| KrownError::Internal(format!("Failed to read log file: {}", e)))?;

    // Get last N lines
    let start = all_lines.len().saturating_sub(lines);
    let logs: Vec<String> = all_lines[start..].to_vec();

    Ok(Json(serde_json::json!({
        "logs": logs,
        "total_lines": all_lines.len(),
        "returned_lines": logs.len()
    })))
}
