use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub ssh: SshConfig,
    pub auth: AuthConfig,
    pub logging: LoggingConfig,
    #[serde(skip)]
    pub config_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub cors_origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfig {
    pub connect_timeout_secs: u64,
    pub command_timeout_secs: u64,
    pub keepalive_interval_secs: u64,
    pub max_sessions_per_user: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub jwt_expiration_hours: u64,
    pub password_min_length: usize,
    pub session_timeout_minutes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub file_path: Option<String>,
}

impl Config {
    pub fn load() -> Result<Self> {
        // Try to load from KROWN_CONFIG env var, or default to config.toml
        let config_path = std::env::var("KROWN_CONFIG")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("config.toml"));

        let content = fs::read_to_string(&config_path)
            .with_context(|| format!("Failed to read config file: {}", config_path.display()))?;

        let mut config: Config = toml::from_str(&content)
            .context("Failed to parse config file")?;

        config.config_path = config_path;

        // Validate configuration
        config.validate()?;

        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        if self.auth.jwt_secret.is_empty() {
            anyhow::bail!("JWT secret cannot be empty");
        }
        if self.auth.password_min_length < 8 {
            anyhow::bail!("Password minimum length must be at least 8");
        }
        Ok(())
    }

    pub fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 8080,
                cors_origins: vec!["http://localhost:3000".to_string()],
            },
            database: DatabaseConfig {
                url: "sqlite:krown.db".to_string(),
                max_connections: 10,
            },
            ssh: SshConfig {
                connect_timeout_secs: 30,
                command_timeout_secs: 60,
                keepalive_interval_secs: 30,
                max_sessions_per_user: 10,
            },
            auth: AuthConfig {
                jwt_secret: std::env::var("KROWN_JWT_SECRET")
                    .unwrap_or_else(|_| "CHANGE_THIS_SECRET_IN_PRODUCTION".to_string()),
                jwt_expiration_hours: 24,
                password_min_length: 8,
                session_timeout_minutes: 60,
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                file_path: Some("krown.log".to_string()),
            },
            config_path: PathBuf::from("config.toml"),
        }
    }
}

