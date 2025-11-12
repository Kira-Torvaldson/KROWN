use crate::models::{Session, SessionStatus, CreateSessionRequest, AuthMethod, ExecuteCommandRequest, CommandExecution};
use crate::database::Database;
use crate::error::KrownError;
use crate::config::Config;
use anyhow::Result;
use async_ssh2::Session as Ssh2Session;
use async_ssh2::ClientSession;
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tokio::time::{timeout, Duration};
use tracing::{info, warn, error};
use uuid::Uuid;

#[derive(Clone)]
pub struct SshManager {
    db: Database,
    config: Config,
    sessions: Arc<RwLock<std::collections::HashMap<Uuid, Arc<Mutex<SshSession>>>>>,
}

struct SshSession {
    id: Uuid,
    ssh_session: ClientSession,
    host: String,
    port: u16,
    username: String,
    created_at: chrono::DateTime<Utc>,
}

impl SshManager {
    pub fn new(db: Database, config: Config) -> Self {
        Self {
            db,
            config,
            sessions: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        user_id: Uuid,
        req: CreateSessionRequest,
    ) -> Result<Session, KrownError> {
        let port = req.port.unwrap_or(22);
        let session_id = Uuid::new_v4();
        let now = Utc::now();

        // Create session record in database
        sqlx::query(
            r#"
            INSERT INTO sessions (id, user_id, host, port, username, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(session_id.to_string())
        .bind(user_id.to_string())
        .bind(&req.host)
        .bind(port as i64)
        .bind(&req.username)
        .bind("connecting")
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        // Update status to connecting
        self.update_session_status(&session_id, SessionStatus::Connecting).await?;

        // Connect to SSH server
        let connect_result = timeout(
            Duration::from_secs(self.config.ssh.connect_timeout_secs),
            self.connect_ssh(&req, port),
        )
        .await;

        match connect_result {
            Ok(Ok(ssh_session)) => {
                let session = Arc::new(Mutex::new(SshSession {
                    id: session_id,
                    ssh_session,
                    host: req.host.clone(),
                    port,
                    username: req.username.clone(),
                    created_at: now,
                }));

                self.sessions.write().await.insert(session_id, session);
                self.update_session_status(&session_id, SessionStatus::Connected).await?;

                info!("SSH session created: {}@{}:{}", req.username, req.host, port);

                Ok(Session {
                    id: session_id,
                    user_id,
                    host: req.host,
                    port,
                    username: req.username,
                    status: SessionStatus::Connected,
                    created_at: now,
                    updated_at: now,
                    closed_at: None,
                })
            }
            Ok(Err(e)) => {
                self.update_session_status(&session_id, SessionStatus::Error).await?;
                Err(KrownError::Ssh(format!("Connection failed: {}", e)))
            }
            Err(_) => {
                self.update_session_status(&session_id, SessionStatus::Error).await?;
                Err(KrownError::Ssh("Connection timeout".to_string()))
            }
        }
    }

    async fn connect_ssh(
        &self,
        req: &CreateSessionRequest,
        port: u16,
    ) -> Result<ClientSession, String> {
        let tcp = tokio::net::TcpStream::connect(format!("{}:{}", req.host, port))
            .await
            .map_err(|e| format!("TCP connection failed: {}", e))?;

        let mut session = ClientSession::new(tcp, &req.host)
            .await
            .map_err(|e| format!("SSH handshake failed: {}", e))?;

        match &req.auth_method {
            AuthMethod::Password { password } => {
                session
                    .userauth_password(&req.username, password)
                    .await
                    .map_err(|e| format!("Password authentication failed: {}", e))?;
            }
            AuthMethod::Key { private_key, passphrase } => {
                // Note: async-ssh2 key auth implementation would go here
                // This is a simplified version
                return Err("Key authentication not yet implemented".to_string());
            }
        }

        Ok(session)
    }

    pub async fn execute_command(
        &self,
        session_id: Uuid,
        req: ExecuteCommandRequest,
    ) -> Result<CommandExecution, KrownError> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| KrownError::SessionNotFound {
                id: session_id.to_string(),
            })?;

        let start_time = std::time::Instant::now();
        let timeout_duration = Duration::from_secs(
            req.timeout_secs.unwrap_or(self.config.ssh.command_timeout_secs),
        );

        let exec_result = timeout(timeout_duration, async {
            let mut session_guard = session.lock().await;
            let mut channel = session_guard
                .ssh_session
                .channel_session()
                .await
                .map_err(|e| format!("Failed to create channel: {}", e))?;

            channel
                .exec(&req.command)
                .await
                .map_err(|e| format!("Failed to execute command: {}", e))?;

            let mut stdout = String::new();
            let mut stderr = String::new();

            // Read output
            loop {
                tokio::select! {
                    result = channel.read_to_string() => {
                        match result {
                            Ok(Some(data)) => stdout.push_str(&data),
                            Ok(None) => break,
                            Err(e) => {
                                stderr.push_str(&format!("Read error: {}", e));
                                break;
                            }
                        }
                    }
                }
            }

            let exit_status = channel.exit_status().await.ok();

            Ok((stdout, stderr, exit_status))
        })
        .await;

        let duration_ms = start_time.elapsed().as_millis() as u64;

        match exec_result {
            Ok(Ok((stdout, stderr, exit_code))) => {
                let execution = CommandExecution {
                    id: Uuid::new_v4(),
                    session_id,
                    command: req.command.clone(),
                    stdout,
                    stderr,
                    exit_code,
                    executed_at: Utc::now(),
                    duration_ms,
                };

                // Log command execution
                self.log_command(&execution).await?;

                Ok(execution)
            }
            Ok(Err(e)) => Err(KrownError::Ssh(e)),
            Err(_) => Err(KrownError::Ssh("Command execution timeout".to_string())),
        }
    }

    async fn log_command(&self, execution: &CommandExecution) -> Result<(), KrownError> {
        sqlx::query(
            r#"
            INSERT INTO command_logs (id, session_id, command, stdout, stderr, exit_code, executed_at, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(execution.id.to_string())
        .bind(execution.session_id.to_string())
        .bind(&execution.command)
        .bind(&execution.stdout)
        .bind(&execution.stderr)
        .bind(execution.exit_code.map(|c| c as i64))
        .bind(execution.executed_at.to_rfc3339())
        .bind(execution.duration_ms as i64)
        .execute(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        Ok(())
    }

    pub async fn close_session(&self, session_id: Uuid) -> Result<(), KrownError> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.remove(&session_id) {
            let mut session_guard = session.lock().await;
            drop(session_guard); // Close SSH connection
        }

        let now = Utc::now();
        sqlx::query(
            r#"
            UPDATE sessions SET status = ?, closed_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind("disconnected")
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .bind(session_id.to_string())
        .execute(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        info!("Session closed: {}", session_id);
        Ok(())
    }

    async fn update_session_status(
        &self,
        session_id: &Uuid,
        status: SessionStatus,
    ) -> Result<(), KrownError> {
        sqlx::query(
            r#"
            UPDATE sessions SET status = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(format!("{:?}", status).to_lowercase())
        .bind(Utc::now().to_rfc3339())
        .bind(session_id.to_string())
        .execute(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        Ok(())
    }

    pub async fn get_session(&self, session_id: &Uuid) -> Result<Session, KrownError> {
        let row = sqlx::query(
            r#"
            SELECT id, user_id, host, port, username, status, created_at, updated_at, closed_at
            FROM sessions WHERE id = ?
            "#,
        )
        .bind(session_id.to_string())
        .fetch_optional(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?
        .ok_or_else(|| KrownError::SessionNotFound {
            id: session_id.to_string(),
        })?;

        Ok(Session {
            id: Uuid::parse_str(row.get::<String, _>("id")).unwrap(),
            user_id: Uuid::parse_str(row.get::<String, _>("user_id")).unwrap(),
            host: row.get("host"),
            port: row.get::<i64, _>("port") as u16,
            username: row.get("username"),
            status: match row.get::<String, _>("status").as_str() {
                "connecting" => SessionStatus::Connecting,
                "connected" => SessionStatus::Connected,
                "disconnected" => SessionStatus::Disconnected,
                "error" => SessionStatus::Error,
                _ => SessionStatus::Error,
            },
            created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))
                .unwrap()
                .with_timezone(&Utc),
            closed_at: row
                .get::<Option<String>, _>("closed_at")
                .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
        })
    }

    pub async fn list_user_sessions(&self, user_id: &Uuid) -> Result<Vec<Session>, KrownError> {
        let rows = sqlx::query(
            r#"
            SELECT id, user_id, host, port, username, status, created_at, updated_at, closed_at
            FROM sessions WHERE user_id = ? ORDER BY created_at DESC
            "#,
        )
        .bind(user_id.to_string())
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        let sessions: Result<Vec<Session>, _> = rows
            .into_iter()
            .map(|row| {
                Ok(Session {
                    id: Uuid::parse_str(row.get::<String, _>("id"))?,
                    user_id: Uuid::parse_str(row.get::<String, _>("user_id"))?,
                    host: row.get("host"),
                    port: row.get::<i64, _>("port") as u16,
                    username: row.get("username"),
                    status: match row.get::<String, _>("status").as_str() {
                        "connecting" => SessionStatus::Connecting,
                        "connected" => SessionStatus::Connected,
                        "disconnected" => SessionStatus::Disconnected,
                        "error" => SessionStatus::Error,
                        _ => SessionStatus::Error,
                    },
                    created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))
                        .unwrap()
                        .with_timezone(&Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))
                        .unwrap()
                        .with_timezone(&Utc),
                    closed_at: row
                        .get::<Option<String>, _>("closed_at")
                        .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
                })
            })
            .collect();

        sessions.map_err(|e: uuid::Error| KrownError::Internal(format!("UUID parsing error: {}", e)))
    }
}

