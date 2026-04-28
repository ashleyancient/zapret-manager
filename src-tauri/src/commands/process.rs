use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, Deserialize)]
pub struct StartArgs {
    pub preset_id: String,
    pub preset_name: String,
    pub args: String,
    pub winws_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StartResult {
    pub pid: u32,
}

fn resolve_winws(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(format!("Файл не найден: {}", path));
    }
    Ok(p.to_path_buf())
}

#[tauri::command]
pub async fn start_zapret(
    app: AppHandle,
    state: State<'_, AppState>,
    args: StartArgs,
) -> Result<StartResult, String> {
    {
        let st = state.status.lock();
        if st.running {
            return Err("Zapret уже запущен".to_string());
        }
    }

    let winws_path = resolve_winws(&args.winws_path)?;
    let working_dir = winws_path
        .parent()
        .ok_or_else(|| "Не удалось определить рабочую директорию".to_string())?
        .to_path_buf();

    let parsed_args = shell_words::split(&args.args)
        .map_err(|e| format!("Ошибка разбора аргументов: {}", e))?;

    let mut cmd = Command::new(&winws_path);
    cmd.args(&parsed_args)
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить winws.exe: {}", e))?;

    let pid = child
        .id()
        .ok_or_else(|| "Не удалось получить PID процесса".to_string())?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let mut st = state.status.lock();
        st.running = true;
        st.pid = Some(pid);
        st.active_preset_id = Some(args.preset_id.clone());
        st.started_at = Some(chrono::Utc::now().timestamp_millis());
        st.winws_path = Some(args.winws_path.clone());
    }

    state.push_log(
        "info",
        format!("▶ Запущен пресет «{}» (PID {})", args.preset_name, pid),
    );
    let _ = app.emit("zapret://status", state.status.lock().clone());
    let _ = app.emit("zapret://log", state.log_buffer.lock().last().cloned());

    if let Some(out) = stdout {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(state) = app_clone.try_state::<AppState>() {
                    state.push_log("info", line.clone());
                    let last = state.log_buffer.lock().last().cloned();
                    let _ = app_clone.emit("zapret://log", last);
                }
            }
        });
    }
    if let Some(err) = stderr {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let lower = line.to_lowercase();
                let level = if lower.contains("error") || lower.contains("fail") {
                    "error"
                } else if lower.contains("warn") {
                    "warn"
                } else {
                    "info"
                };
                if let Some(state) = app_clone.try_state::<AppState>() {
                    state.push_log(level, line.clone());
                    let last = state.log_buffer.lock().last().cloned();
                    let _ = app_clone.emit("zapret://log", last);
                }
            }
        });
    }

    let app_for_wait = app.clone();
    let child_holder = state.child.clone();
    {
        let mut guard = child_holder.lock().await;
        *guard = Some(child);
    }
    tokio::spawn(async move {
        let mut guard = child_holder.lock().await;
        if let Some(mut c) = guard.take() {
            let exit = c.wait().await;
            if let Some(state) = app_for_wait.try_state::<AppState>() {
                let mut st = state.status.lock();
                st.running = false;
                st.pid = None;
                let was_started = st.started_at.is_some();
                st.started_at = None;
                drop(st);
                state.push_log(
                    "warn",
                    format!("⏹ Процесс завершён ({:?})", exit.map(|e| e.code()).ok().flatten()),
                );
                let _ = app_for_wait.emit("zapret://status", state.status.lock().clone());
                let _ = app_for_wait.emit("zapret://log", state.log_buffer.lock().last().cloned());
                if was_started {
                    let _ = app_for_wait.emit("zapret://exited", ());
                }
            }
        }
    });

    Ok(StartResult { pid })
}

#[tauri::command]
pub async fn stop_zapret(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let st = state.status.lock();
        if !st.running {
            return Ok(());
        }
    }

    let child_arc = state.child.clone();
    let mut guard = child_arc.lock().await;
    if let Some(child) = guard.as_mut() {
        let _ = child.start_kill();
        match tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await {
            Ok(_) => {}
            Err(_) => {
                let _ = child.kill().await;
            }
        }
    }
    *guard = None;

    {
        let mut st = state.status.lock();
        st.running = false;
        st.pid = None;
        st.started_at = None;
    }

    state.push_log("info", "⏹ Остановлено пользователем".to_string());
    let _ = app.emit("zapret://status", state.status.lock().clone());
    let _ = app.emit("zapret://log", state.log_buffer.lock().last().cloned());
    Ok(())
}

#[tauri::command]
pub fn get_status(state: State<'_, AppState>) -> crate::state::ZapretStatus {
    state.status.lock().clone()
}

#[tauri::command]
pub fn get_logs(state: State<'_, AppState>) -> Vec<crate::state::LogLine> {
    state.log_buffer.lock().clone()
}

#[tauri::command]
pub fn clear_logs(state: State<'_, AppState>) {
    state.log_buffer.lock().clear();
}
