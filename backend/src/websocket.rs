use crate::auth::AuthService;
use crate::error::KrownError;
use crate::models::WebSocketEvent;
use crate::ssh::SshManager;
use axum::extract::{ws::Message, State};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{info, warn, error};
use uuid::Uuid;

pub struct AppState {
    pub auth: AuthService,
    pub ssh: SshManager,
}

pub async fn websocket_handler(
    ws: axum::extract::ws::WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Send welcome message
    let welcome = json!({
        "type": "welcome",
        "message": "Connected to Krown WebSocket"
    });
    if let Err(e) = sender.send(Message::Text(serde_json::to_string(&welcome).unwrap())).await {
        error!("Failed to send welcome message: {}", e);
        return;
    }

    info!("WebSocket client connected");

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Err(e) = handle_message(&text, &mut sender, &state).await {
                    error!("Error handling message: {}", e);
                    let error_msg = json!({
                        "type": "error",
                        "message": e.to_string()
                    });
                    let _ = sender.send(Message::Text(serde_json::to_string(&error_msg).unwrap())).await;
                }
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket client disconnected");
                break;
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }
}

async fn handle_message(
    text: &str,
    sender: &mut futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>,
    state: &Arc<AppState>,
) -> Result<(), KrownError> {
    let msg: serde_json::Value = serde_json::from_str(text)
        .map_err(|_| KrownError::InvalidInput("Invalid JSON".to_string()))?;

    let msg_type = msg.get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| KrownError::InvalidInput("Missing 'type' field".to_string()))?;

    match msg_type {
        "authenticate" => {
            let token = msg.get("token")
                .and_then(|v| v.as_str())
                .ok_or_else(|| KrownError::InvalidInput("Missing 'token' field".to_string()))?;

            let claims = state.auth.verify_token(token)?;
            let response = json!({
                "type": "authenticated",
                "user_id": claims.sub,
                "username": claims.username
            });
            sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await
                .map_err(|e| KrownError::WebSocket(format!("Send error: {}", e)))?;
        }
        "subscribe_session" => {
            let session_id = msg.get("session_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| KrownError::InvalidInput("Missing 'session_id' field".to_string()))?;

            // In a full implementation, we would track subscriptions and send updates
            let response = json!({
                "type": "subscribed",
                "session_id": session_id
            });
            sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await
                .map_err(|e| KrownError::WebSocket(format!("Send error: {}", e)))?;
        }
        "ping" => {
            let response = json!({
                "type": "pong"
            });
            sender.send(Message::Text(serde_json::to_string(&response).unwrap())).await
                .map_err(|e| KrownError::WebSocket(format!("Send error: {}", e)))?;
        }
        _ => {
            return Err(KrownError::InvalidInput(format!("Unknown message type: {}", msg_type)));
        }
    }

    Ok(())
}

// Streaming handler for SSH session output
pub async fn stream_handler(
    ws: axum::extract::ws::WebSocketUpgrade,
    session_id: String,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_stream(socket, session_id, state))
}

async fn handle_stream(
    socket: axum::extract::ws::WebSocket,
    session_id: String,
    state: Arc<AppState>,
) {
    let (mut sender, mut receiver) = socket.split();

    // Parse session ID
    let session_uuid = match Uuid::parse_str(&session_id) {
        Ok(id) => id,
        Err(_) => {
            let error = WebSocketEvent::Error {
                message: "Invalid session ID".to_string(),
            };
            let _ = sender.send(Message::Text(serde_json::to_string(&error).unwrap())).await;
            return;
        }
    };

    // Get session
    let session = match state.ssh.get_session(&session_uuid).await {
        Ok(s) => s,
        Err(e) => {
            let error = WebSocketEvent::Error {
                message: format!("Session not found: {}", e),
            };
            let _ = sender.send(Message::Text(serde_json::to_string(&error).unwrap())).await;
            return;
        }
    };

    // Send welcome message
    let welcome = WebSocketEvent::Welcome {
        message: format!("Connected to stream for session {}", session_id),
    };
    if let Err(e) = sender.send(Message::Text(serde_json::to_string(&welcome).unwrap())).await {
        error!("Failed to send welcome message: {}", e);
        return;
    }

    info!("WebSocket stream connected for session: {}", session_id);

    // Create a channel for streaming output
    let (tx, mut rx) = broadcast::channel::<String>(100);

    // Spawn a task to monitor SSH session and send output
    let session_id_clone = session_id.clone();
    let ssh_manager = state.ssh.clone();
    tokio::spawn(async move {
        // In a real implementation, we would:
        // 1. Get the SSH session from SshManager
        // 2. Monitor its output in real-time
        // 3. Send output to the broadcast channel
        // For now, this is a placeholder that demonstrates the structure
        
        // Example: Send periodic updates (in real implementation, this would be SSH output)
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            
            // Check if session is still connected
            match ssh_manager.get_session(&session_uuid).await {
                Ok(s) => {
                    use crate::models::SessionStatus;
                    if !matches!(s.status, SessionStatus::Connected) {
                        let status_event = WebSocketEvent::SessionStatus {
                            session_id: session_id_clone.clone(),
                            status: format!("{:?}", s.status).to_lowercase(),
                        };
                        let _ = tx.send(serde_json::to_string(&status_event).unwrap());
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Forward messages from broadcast channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                // Handle commands or other messages
                if let Ok(cmd_msg) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(cmd) = cmd_msg.get("command").and_then(|v| v.as_str()) {
                        // Execute command and stream output
                        match state.ssh.execute_command(
                            session_uuid,
                            crate::models::ExecuteCommandRequest {
                                command: cmd.to_string(),
                                timeout_secs: None,
                            },
                        ).await {
                            Ok(execution) => {
                                // Send stdout
                                if !execution.stdout.is_empty() {
                                    let output = WebSocketEvent::Output {
                                        session_id: session_id.clone(),
                                        stream: "stdout".to_string(),
                                        data: execution.stdout,
                                    };
                                    let _ = tx.send(serde_json::to_string(&output).unwrap());
                                }
                                
                                // Send stderr
                                if !execution.stderr.is_empty() {
                                    let output = WebSocketEvent::Output {
                                        session_id: session_id.clone(),
                                        stream: "stderr".to_string(),
                                        data: execution.stderr,
                                    };
                                    let _ = tx.send(serde_json::to_string(&output).unwrap());
                                }
                                
                                // Send completion
                                let complete = WebSocketEvent::CommandComplete {
                                    session_id: session_id.clone(),
                                    exit_code: execution.exit_code.unwrap_or(0),
                                };
                                let _ = tx.send(serde_json::to_string(&complete).unwrap());
                            }
                            Err(e) => {
                                let error = WebSocketEvent::Error {
                                    message: format!("Command execution failed: {}", e),
                                };
                                let _ = tx.send(serde_json::to_string(&error).unwrap());
                            }
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket stream disconnected for session: {}", session_id);
                break;
            }
            Err(e) => {
                error!("WebSocket stream error: {}", e);
                break;
            }
            _ => {}
        }
    }

    send_task.abort();
    info!("WebSocket stream closed for session: {}", session_id);
}

