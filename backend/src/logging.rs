use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use tracing_subscriber::{
    fmt,
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Registry,
};
use tracing_appender::{non_blocking, rolling};

pub fn init_logging(config: &crate::config::LoggingConfig) -> Result<()> {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            EnvFilter::try_new(&config.level)
                .unwrap_or_else(|_| EnvFilter::new("info"))
        });

    // Console layer (always enabled)
    let console_layer = fmt::layer()
        .with_target(false)
        .with_thread_ids(false)
        .with_line_number(true)
        .with_file(true)
        .with_writer(std::io::stdout);

    // File layer (if file_path is configured)
    if let Some(ref file_path) = config.file_path {
        let log_path = PathBuf::from(file_path);
        let log_dir = log_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf();

        // Create log directory if it doesn't exist
        std::fs::create_dir_all(&log_dir)?;

        let file_appender = rolling::daily(log_dir, "krown");
        let (non_blocking_appender, _guard) = non_blocking(file_appender);
        
        // Store guard to prevent logs from being dropped (leak to keep it alive)
        let _guard = Box::leak(Box::new(_guard));

        let file_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(true)
            .with_line_number(true)
            .with_file(true)
            .with_ansi(false)
            .with_writer(non_blocking_appender)
            .json(); // JSON format for structured logging

        Registry::default()
            .with(filter)
            .with(console_layer)
            .with(file_layer)
            .init();
    } else {
        // Only console logging
        Registry::default()
            .with(filter)
            .with(console_layer)
            .init();
    }

    Ok(())
}

