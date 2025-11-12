use crate::database::Database;
use crate::error::KrownError;
use crate::models::{Server, ServerInfo, CreateServerRequest, UpdateServerRequest};
use anyhow::Result;
use chrono::Utc;
use sqlx::Row;
use tracing::info;
use uuid::Uuid;

pub struct ServerService {
    db: Database,
}

impl ServerService {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub async fn create_server(
        &self,
        user_id: Uuid,
        req: CreateServerRequest,
    ) -> Result<ServerInfo, KrownError> {
        let server_id = Uuid::new_v4();
        let now = Utc::now();
        let port = req.port.unwrap_or(22);

        sqlx::query(
            r#"
            INSERT INTO servers (id, user_id, name, host, port, username, auth_method, password, private_key, passphrase, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(server_id.to_string())
        .bind(user_id.to_string())
        .bind(&req.name)
        .bind(&req.host)
        .bind(port as i64)
        .bind(&req.username)
        .bind(&req.auth_method)
        .bind(&req.password)
        .bind(&req.private_key)
        .bind(&req.passphrase)
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        info!("Server created: {} ({})", req.name, server_id);

        self.get_server(&server_id, &user_id).await
    }

    pub async fn get_server(&self, server_id: &Uuid, user_id: &Uuid) -> Result<ServerInfo, KrownError> {
        let row = sqlx::query(
            r#"
            SELECT id, user_id, name, host, port, username, auth_method, created_at, updated_at
            FROM servers WHERE id = ? AND user_id = ?
            "#,
        )
        .bind(server_id.to_string())
        .bind(user_id.to_string())
        .fetch_optional(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?
        .ok_or_else(|| KrownError::InvalidInput("Server not found".to_string()))?;

        Ok(ServerInfo {
            id: Uuid::parse_str(row.get::<String, _>("id")).unwrap(),
            user_id: Uuid::parse_str(row.get::<String, _>("user_id")).unwrap(),
            name: row.get("name"),
            host: row.get("host"),
            port: row.get::<i64, _>("port") as u16,
            username: row.get("username"),
            auth_method: row.get("auth_method"),
            created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))
                .unwrap()
                .with_timezone(&Utc),
        })
    }

    pub async fn get_server_with_credentials(
        &self,
        server_id: &Uuid,
        user_id: &Uuid,
    ) -> Result<Server, KrownError> {
        let row = sqlx::query(
            r#"
            SELECT id, user_id, name, host, port, username, auth_method, password, private_key, passphrase, created_at, updated_at
            FROM servers WHERE id = ? AND user_id = ?
            "#,
        )
        .bind(server_id.to_string())
        .bind(user_id.to_string())
        .fetch_optional(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?
        .ok_or_else(|| KrownError::InvalidInput("Server not found".to_string()))?;

        Ok(Server {
            id: Uuid::parse_str(row.get::<String, _>("id")).unwrap(),
            user_id: Uuid::parse_str(row.get::<String, _>("user_id")).unwrap(),
            name: row.get("name"),
            host: row.get("host"),
            port: row.get::<i64, _>("port") as u16,
            username: row.get("username"),
            auth_method: row.get("auth_method"),
            password: row.get("password"),
            private_key: row.get("private_key"),
            passphrase: row.get("passphrase"),
            created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))
                .unwrap()
                .with_timezone(&Utc),
        })
    }

    pub async fn list_servers(&self, user_id: &Uuid) -> Result<Vec<ServerInfo>, KrownError> {
        let rows = sqlx::query(
            r#"
            SELECT id, user_id, name, host, port, username, auth_method, created_at, updated_at
            FROM servers WHERE user_id = ? ORDER BY created_at DESC
            "#,
        )
        .bind(user_id.to_string())
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        let servers: Result<Vec<ServerInfo>, _> = rows
            .into_iter()
            .map(|row| {
                Ok(ServerInfo {
                    id: Uuid::parse_str(row.get::<String, _>("id"))?,
                    user_id: Uuid::parse_str(row.get::<String, _>("user_id"))?,
                    name: row.get("name"),
                    host: row.get("host"),
                    port: row.get::<i64, _>("port") as u16,
                    username: row.get("username"),
                    auth_method: row.get("auth_method"),
                    created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))
                        .unwrap()
                        .with_timezone(&Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })
            .collect();

        servers.map_err(|e: uuid::Error| KrownError::Internal(format!("UUID parsing error: {}", e)))
    }

    pub async fn update_server(
        &self,
        server_id: &Uuid,
        user_id: &Uuid,
        req: UpdateServerRequest,
    ) -> Result<ServerInfo, KrownError> {
        let now = Utc::now();

        // Build update query dynamically
        let mut updates = Vec::new();
        let mut params: Vec<String> = Vec::new();

        if let Some(name) = &req.name {
            updates.push("name = ?");
            params.push(name.clone());
        }
        if let Some(host) = &req.host {
            updates.push("host = ?");
            params.push(host.clone());
        }
        if let Some(port) = req.port {
            updates.push("port = ?");
            params.push(port.to_string());
        }
        if let Some(username) = &req.username {
            updates.push("username = ?");
            params.push(username.clone());
        }
        if let Some(auth_method) = &req.auth_method {
            updates.push("auth_method = ?");
            params.push(auth_method.clone());
        }
        if req.password.is_some() {
            updates.push("password = ?");
            params.push(req.password.as_ref().unwrap().clone());
        }
        if req.private_key.is_some() {
            updates.push("private_key = ?");
            params.push(req.private_key.as_ref().unwrap().clone());
        }
        if req.passphrase.is_some() {
            updates.push("passphrase = ?");
            params.push(req.passphrase.as_ref().unwrap().unwrap_or_default());
        }

        if updates.is_empty() {
            return self.get_server(server_id, user_id).await;
        }

        updates.push("updated_at = ?");
        params.push(now.to_rfc3339());

        let query = format!(
            "UPDATE servers SET {} WHERE id = ? AND user_id = ?",
            updates.join(", ")
        );

        let mut query_builder = sqlx::query(&query);
        for param in params {
            query_builder = query_builder.bind(param);
        }
        query_builder
            .bind(server_id.to_string())
            .bind(user_id.to_string())
            .execute(self.db.pool())
            .await
            .map_err(|e| KrownError::Database(e))?;

        self.get_server(server_id, user_id).await
    }

    pub async fn delete_server(&self, server_id: &Uuid, user_id: &Uuid) -> Result<(), KrownError> {
        sqlx::query("DELETE FROM servers WHERE id = ? AND user_id = ?")
            .bind(server_id.to_string())
            .bind(user_id.to_string())
            .execute(self.db.pool())
            .await
            .map_err(|e| KrownError::Database(e))?;

        info!("Server deleted: {}", server_id);
        Ok(())
    }
}

