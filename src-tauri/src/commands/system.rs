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

/// Kill any leftover winws.exe processes from previous app sessions.
/// Returns the number of processes killed.
#[tauri::command]
pub fn kill_orphan_winws() -> u32 {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        // CREATE_NO_WINDOW = 0x08000000
        let output = Command::new("taskkill")
            .args(["/F", "/IM", "winws.exe"])
            .creation_flags(0x0800_0000)
            .output();
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout.matches("SUCCESS:").count() as u32
            }
            Err(_) => 0,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        0
    }
}
