use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatPreset {
    pub file_path: String,
    pub file_name: String,
    pub display_name: String,
    pub args: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TestResult {
    pub file_path: String,
    pub display_name: String,
    pub ok: bool,
    pub exit_code: Option<i32>,
    pub reason: Option<String>,
    pub output_excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AutotestProgress {
    pub index: usize,
    pub total: usize,
    pub display_name: String,
    pub phase: String, // "running" | "done"
    pub result: Option<TestResult>,
}

fn expand_vars(s: &str, vars: &HashMap<String, String>, dp0: &str) -> String {
    let mut out = s.to_string();
    // %~dp0 — directory of the .bat file (with trailing backslash)
    out = out.replace("%~dp0", dp0);
    // Resolve named %VAR% references; iterate a few times for nested vars.
    for _ in 0..4 {
        let mut changed = false;
        for (k, v) in vars {
            let pat = format!("%{}%", k);
            if out.contains(&pat) {
                out = out.replace(&pat, v);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    out
}

/// Join lines split with `^` continuation char, drop comment lines.
fn join_continuations(content: &str) -> Vec<String> {
    let mut joined: Vec<String> = Vec::new();
    let mut current = String::new();
    for raw_line in content.lines() {
        let line = raw_line.trim_end_matches(['\r', '\n']);
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();
        // skip comments
        if lower.starts_with("rem ")
            || lower == "rem"
            || trimmed.starts_with("::")
            || trimmed.is_empty()
        {
            if !current.is_empty() {
                joined.push(std::mem::take(&mut current));
            }
            continue;
        }
        let line_trim_end = line.trim_end();
        if let Some(stripped) = line_trim_end.strip_suffix('^') {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(stripped.trim_start().trim_end());
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(line.trim_start());
            joined.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        joined.push(current);
    }
    joined
}

fn parse_bat_file(path: &Path) -> Result<BatPreset, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("read {}: {}", path.display(), e))?;
    let bat_dir = path
        .parent()
        .ok_or_else(|| "bat has no parent dir".to_string())?
        .to_path_buf();
    let mut bat_dir_str = bat_dir.to_string_lossy().to_string();
    if !bat_dir_str.ends_with('\\') && !bat_dir_str.ends_with('/') {
        bat_dir_str.push('\\');
    }

    let lines = join_continuations(&content);

    let mut vars: HashMap<String, String> = HashMap::new();
    let mut winws_args: Option<String> = None;

    for raw in &lines {
        let line = raw.trim();
        let lower = line.to_lowercase();

        if lower.starts_with("set ") {
            let rest = &line[4..];
            if let Some(eq) = rest.find('=') {
                let name = rest[..eq].trim().to_string();
                let value = rest[eq + 1..].trim().trim_matches('"').to_string();
                let expanded = expand_vars(&value, &vars, &bat_dir_str);
                vars.insert(name, expanded);
            }
            continue;
        }

        if lower.contains("winws.exe") {
            let expanded = expand_vars(line, &vars, &bat_dir_str);
            let lower_e = expanded.to_lowercase();
            if let Some(pos) = lower_e.find("winws.exe") {
                let after = &expanded[pos + "winws.exe".len()..];
                let after_trim = after.trim_start_matches([' ', '"', '\t']);
                if !after_trim.is_empty() {
                    winws_args = Some(after_trim.to_string());
                    break;
                }
            }
        }
    }

    let args = winws_args
        .ok_or_else(|| format!("no winws.exe invocation in {}", path.display()))?;

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("preset")
        .to_string();
    let display_name = file_stem.replace('_', " ");
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("preset.bat")
        .to_string();

    Ok(BatPreset {
        file_path: path.to_string_lossy().to_string(),
        file_name,
        display_name,
        args,
    })
}

fn walk_collect_bats(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<PathBuf>) {
    if depth > max_depth {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(it) => it,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            // Skip subdirs that won't contain useful presets.
            if matches!(name.as_str(), "bin" | "lists" | ".git" | "tmp" | "log") {
                continue;
            }
            walk_collect_bats(&path, depth + 1, max_depth, out);
        } else if path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("bat") || s.eq_ignore_ascii_case("cmd"))
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
}

/// Scan a zapret installation root for *.bat / *.cmd files that invoke winws.exe
/// and extract their arguments (with %~dp0 / named %VAR% references resolved).
#[tauri::command]
pub fn scan_zapret_bats(root: String) -> Result<Vec<BatPreset>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err(format!("Папка не найдена: {}", root));
    }
    let scan_dir = if root_path.is_file() {
        root_path
            .parent()
            .ok_or_else(|| "no parent".to_string())?
            .to_path_buf()
    } else {
        root_path
    };
    // If user pointed at the bin dir, climb up one level.
    let scan_dir = if scan_dir
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("bin"))
        .unwrap_or(false)
    {
        scan_dir
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or(scan_dir)
    } else {
        scan_dir
    };

    let mut paths = Vec::new();
    walk_collect_bats(&scan_dir, 0, 2, &mut paths);
    paths.sort();

    let skip_substrings = [
        "blockcheck",
        "service_install",
        "service_remove",
        "service_start",
        "service_stop",
        "preload",
        "ipset",
    ];

    let mut found = Vec::new();
    for path in paths {
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if skip_substrings.iter().any(|s| stem.contains(s)) {
            continue;
        }
        if let Ok(bp) = parse_bat_file(&path) {
            found.push(bp);
        }
    }

    Ok(found)
}

fn looks_like_winws_error(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let markers = [
        ("invalid desync combo", "Invalid desync combo"),
        (
            "windivert filter : must specify",
            "WinDivert filter не задан (--wf-tcp/--wf-udp)",
        ),
        ("a copy of winws is already running", "winws уже запущен"),
        ("invalid option", "Неизвестный аргумент"),
        ("error:", "Ошибка winws"),
        ("not enough memory", "Недостаточно памяти"),
        ("could not start service", "Не удалось запустить сервис"),
        ("failed to load windivert", "Не удалось загрузить WinDivert (нет админа?)"),
    ];
    for (needle, label) in markers {
        if lower.contains(needle) {
            return Some(label.to_string());
        }
    }
    None
}

async fn run_single_test(
    args: String,
    winws_path: String,
    duration_ms: u64,
) -> Result<(TestResult, String), String> {
    let p = PathBuf::from(&winws_path);
    if !p.exists() {
        return Err(format!("winws.exe не найден: {}", winws_path));
    }
    let working_dir = p
        .parent()
        .ok_or_else(|| "Не удалось определить рабочую директорию".to_string())?
        .to_path_buf();
    let parsed = shell_words::split(&args)
        .map_err(|e| format!("Ошибка разбора аргументов: {}", e))?;

    let mut cmd = Command::new(&p);
    cmd.args(&parsed)
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить winws.exe: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let buf = Arc::new(Mutex::new(String::new()));

    if let Some(out) = stdout {
        let buf2 = buf.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let mut g = buf2.lock();
                if g.len() < 8192 {
                    g.push_str(&line);
                    g.push('\n');
                }
            }
        });
    }
    if let Some(err) = stderr {
        let buf2 = buf.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let mut g = buf2.lock();
                if g.len() < 8192 {
                    g.push_str(&line);
                    g.push('\n');
                }
            }
        });
    }

    let wait = tokio::time::timeout(Duration::from_millis(duration_ms), child.wait()).await;

    let (survived, exit_code) = match wait {
        Ok(Ok(status)) => (false, status.code()),
        Ok(Err(_)) => (false, None),
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            (true, None)
        }
    };

    // Allow buffered async readers to drain.
    tokio::time::sleep(Duration::from_millis(80)).await;
    let collected = buf.lock().clone();

    let known_error = looks_like_winws_error(&collected);
    let ok = survived && known_error.is_none();
    let reason = if ok {
        Some(format!("Процесс работал ≥ {} мс без ошибок", duration_ms))
    } else if let Some(err) = known_error.clone() {
        Some(err)
    } else if !survived {
        Some(format!(
            "Процесс завершился сразу (код {})",
            exit_code.map(|c| c.to_string()).unwrap_or_else(|| "?".into())
        ))
    } else {
        Some("Не удалось определить статус".to_string())
    };

    Ok((
        TestResult {
            file_path: String::new(),
            display_name: String::new(),
            ok,
            exit_code,
            reason,
            output_excerpt: if collected.is_empty() {
                None
            } else {
                Some(collected.clone())
            },
        },
        collected,
    ))
}

/// Sequentially test each preset by spawning winws.exe with its args and
/// observing whether the process stays alive without producing known error
/// markers in its output. Emits `bats://progress` events between tests.
#[tauri::command]
pub async fn autotest_bat_presets(
    app: AppHandle,
    presets: Vec<BatPreset>,
    winws_path: String,
    per_test_ms: Option<u64>,
) -> Result<Vec<TestResult>, String> {
    // Make sure no leftovers hold the WinDivert filter.
    kill_all_winws();

    let dur = per_test_ms.unwrap_or(4_000);
    let total = presets.len();
    let mut results: Vec<TestResult> = Vec::with_capacity(total);

    for (i, bp) in presets.into_iter().enumerate() {
        let _ = app.emit(
            "bats://progress",
            AutotestProgress {
                index: i,
                total,
                display_name: bp.display_name.clone(),
                phase: "running".into(),
                result: None,
            },
        );

        let test_result = match run_single_test(bp.args.clone(), winws_path.clone(), dur).await {
            Ok((mut r, _)) => {
                r.file_path = bp.file_path.clone();
                r.display_name = bp.display_name.clone();
                r
            }
            Err(e) => TestResult {
                file_path: bp.file_path.clone(),
                display_name: bp.display_name.clone(),
                ok: false,
                exit_code: None,
                reason: Some(e),
                output_excerpt: None,
            },
        };

        // After each test, ensure no winws is left holding the filter.
        kill_all_winws();
        // Small breathing room before the next test (let WinDivert release).
        tokio::time::sleep(Duration::from_millis(400)).await;

        let _ = app.emit(
            "bats://progress",
            AutotestProgress {
                index: i,
                total,
                display_name: test_result.display_name.clone(),
                phase: "done".into(),
                result: Some(test_result.clone()),
            },
        );
        results.push(test_result);
    }

    Ok(results)
}

fn kill_all_winws() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "winws.exe"])
            .creation_flags(0x0800_0000)
            .output();
    }
}
