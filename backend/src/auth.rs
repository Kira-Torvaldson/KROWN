use crate::models::{User, UserRole, CreateUserRequest, LoginRequest, LoginResponse, UserInfo};
use crate::database::Database;
use crate::error::KrownError;
use crate::config::Config;
use anyhow::Result;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user id
    pub username: String,
    pub role: String,
    pub exp: i64,
}

pub struct AuthService {
    db: Database,
    config: Config,
}

impl AuthService {
    pub fn new(db: Database, config: Config) -> Self {
        Self { db, config }
    }

    pub async fn create_user(&self, req: CreateUserRequest) -> Result<User, KrownError> {
        // Validate username
        if req.username.len() < 3 {
            return Err(KrownError::InvalidInput(
                "Username must be at least 3 characters".to_string()
            ));
        }

        // Check if username already exists
        let existing = sqlx::query(
            r#"SELECT id FROM users WHERE username = ?"#
        )
        .bind(&req.username)
        .fetch_optional(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?;

        if existing.is_some() {
            return Err(KrownError::InvalidInput(
                "Username already exists".to_string()
            ));
        }

        // Validate password
        if req.password.len() < self.config.auth.password_min_length {
            return Err(KrownError::InvalidInput(format!(
                "Password must be at least {} characters",
                self.config.auth.password_min_length
            )));
        }

        // Hash password
        let salt = SaltString::generate(&mut rand::thread_rng());
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(req.password.as_bytes(), &salt)
            .map_err(|e| KrownError::Internal(format!("Password hashing failed: {}", e)))?
            .to_string();

        let user_id = Uuid::new_v4();
        let now = Utc::now();

        let role_str = match req.role {
            crate::models::UserRole::Admin => "admin",
            crate::models::UserRole::Operator => "operator",
            crate::models::UserRole::ReadOnly => "readonly",
        };

        sqlx::query(
            r#"
            INSERT INTO users (id, username, password_hash, email, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(user_id.to_string())
        .bind(&req.username)
        .bind(&password_hash)
        .bind(&req.email)
        .bind(role_str)
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(self.db.pool())
        .await
        .map_err(|e| {
            warn!("Database error during user creation: {}", e);
            KrownError::Database(e)
        })?;

        info!("User created: {}", req.username);

        Ok(User {
            id: user_id,
            username: req.username,
            password_hash,
            email: req.email,
            role: req.role,
            created_at: now,
            updated_at: now,
            last_login: None,
        })
    }

    pub async fn login(&self, req: LoginRequest) -> Result<LoginResponse, KrownError> {
        let row = sqlx::query(
            r#"
            SELECT id, username, password_hash, email, role, created_at, updated_at, last_login
            FROM users WHERE username = ?
            "#,
        )
        .bind(&req.username)
        .fetch_optional(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?
        .ok_or_else(|| KrownError::Auth("Invalid credentials".to_string()))?;

        let password_hash_str: String = row.get("password_hash");
        let password_hash = PasswordHash::new(&password_hash_str)
            .map_err(|e| KrownError::Internal(format!("Invalid password hash: {}", e)))?;

        let argon2 = Argon2::default();
        argon2
            .verify_password(req.password.as_bytes(), &password_hash)
            .map_err(|_| KrownError::Auth("Invalid credentials".to_string()))?;

        // Update last login
        let now = Utc::now();
        sqlx::query("UPDATE users SET last_login = ? WHERE username = ?")
            .bind(now.to_rfc3339())
            .bind(&req.username)
            .execute(self.db.pool())
            .await
            .map_err(|e| KrownError::Database(e))?;

        let user_id: String = row.get("id");
        let username: String = row.get("username");
        let email: Option<String> = row.get("email");
        let role_str: String = row.get("role");
        let role = match role_str.as_str() {
            "admin" => UserRole::Admin,
            "operator" => UserRole::Operator,
            "readonly" => UserRole::ReadOnly,
            _ => return Err(KrownError::Internal("Invalid role".to_string())),
        };

        // Generate JWT
        let exp = (Utc::now() + Duration::hours(self.config.auth.jwt_expiration_hours as i64)).timestamp();
        let claims = Claims {
            sub: user_id.clone(),
            username: username.clone(),
            role: role_str,
            exp,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.config.auth.jwt_secret.as_ref()),
        )
        .map_err(|e| KrownError::Internal(format!("JWT encoding failed: {}", e)))?;

        info!("User logged in: {}", username);

        Ok(LoginResponse {
            token,
            user: UserInfo {
                id: Uuid::parse_str(&user_id).unwrap(),
                username,
                email,
                role,
            },
        })
    }

    pub fn verify_token(&self, token: &str) -> Result<Claims, KrownError> {
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.config.auth.jwt_secret.as_ref()),
            &Validation::default(),
        )
        .map_err(|e| KrownError::Auth(format!("Invalid token: {}", e)))?;

        Ok(token_data.claims)
    }

    pub async fn get_user_by_id(&self, user_id: &str) -> Result<User, KrownError> {
        let row = sqlx::query(
            r#"
            SELECT id, username, password_hash, email, role, created_at, updated_at, last_login
            FROM users WHERE id = ?
            "#,
        )
        .bind(user_id)
        .fetch_optional(self.db.pool())
        .await
        .map_err(|e| KrownError::Database(e))?
        .ok_or_else(|| KrownError::UserNotFound {
            username: user_id.to_string(),
        })?;

        Ok(User {
            id: Uuid::parse_str(row.get::<String, _>("id")).unwrap(),
            username: row.get("username"),
            password_hash: row.get("password_hash"),
            email: row.get("email"),
            role: match row.get::<String, _>("role").as_str() {
                "admin" => UserRole::Admin,
                "operator" => UserRole::Operator,
                "readonly" => UserRole::ReadOnly,
                _ => return Err(KrownError::Internal("Invalid role".to_string())),
            },
            created_at: chrono::DateTime::parse_from_rfc3339(row.get("created_at"))
                .unwrap()
                .with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(row.get("updated_at"))
                .unwrap()
                .with_timezone(&Utc),
            last_login: row
                .get::<Option<String>, _>("last_login")
                .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
        })
    }
}

