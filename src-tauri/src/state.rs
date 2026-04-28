use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use tokio::process::Child;
use tokio::sync::Mutex as AsyncMutex;

#[derive(Debug, Clone, Default, Serialize)]
pub struct ZapretStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub active_preset_id: Option<String>,
    pub started_at: Option<i64>,
    pub winws_path: Option<String>,
}

pub struct AppState {
    pub status: Mutex<ZapretStatus>,
    pub child: Arc<AsyncMutex<Option<Child>>>,
    pub log_buffer: Mutex<Vec<LogLine>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    pub ts: i64,
    pub level: String,
    pub text: String,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(ZapretStatus::default()),
            child: Arc::new(AsyncMutex::new(None)),
            log_buffer: Mutex::new(Vec::new()),
        }
    }

    pub fn push_log(&self, level: &str, text: String) {
        let mut buf = self.log_buffer.lock();
        buf.push(LogLine {
            ts: chrono::Utc::now().timestamp_millis(),
            level: level.to_string(),
            text,
        });
        let len = buf.len();
        if len > 500 {
            buf.drain(0..(len - 500));
        }
    }
}
