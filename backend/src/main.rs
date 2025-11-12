mod config;
mod database;
mod auth;
mod ssh;
mod server;
mod api;
mod websocket;
mod models;
mod error;
mod logging;

use anyhow::Result;
use tracing::{info, error};
use config::Config;

#[tokio::main]
async fn main() -> Result<()> {
    // Load configuration first (needed for logging config)
    let config = match Config::load() {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("Failed to load config: {}", e);
            eprintln!("Using default configuration...");
            Config::default()
        }
    };

    // Initialize logging with configuration
    logging::init_logging(&config.logging)?;

    info!("Starting Krown Backend...");
    info!("Configuration loaded from {}", config.config_path.display());

    // Initialize database
    let db = database::Database::new(&config.database.url).await?;
    db.migrate().await?;
    info!("Database initialized and migrated");

    // Start API server
    let api_handle = tokio::spawn({
        let db = db.clone();
        let config = config.clone();
        async move {
            if let Err(e) = api::start_server(config, db).await {
                error!("API server error: {}", e);
            }
        }
    });

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    info!("Shutdown signal received, gracefully shutting down...");

    api_handle.abort();
    info!("Krown Backend stopped");

    Ok(())
}

