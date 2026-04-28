use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct WinwsInfo {
    pub exists: bool,
    pub version: Option<String>,
}

#[tauri::command]
pub fn check_winws(path: String) -> WinwsInfo {
    let p = Path::new(&path);
    let exists = p.exists() && p.is_file();
    let version = if exists {
        std::fs::metadata(p)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let dt: chrono::DateTime<chrono::Local> = t.into();
                dt.format("%Y-%m-%d").to_string()
            })
    } else {
        None
    };
    WinwsInfo { exists, version }
}

#[tauri::command]
pub fn default_winws_path() -> String {
    if cfg!(target_os = "windows") {
        "C:\\Tools\\zapret\\bin\\winws.exe".to_string()
    } else {
        "/opt/zapret/bin/winws".to_string()
    }
}
