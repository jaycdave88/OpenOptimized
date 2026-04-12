//! OpenOptimized diagnostics collector.
//!
//! Produces a single plain-text report covering everything a user might
//! need to share for triage: version info, prereq tool versions, Ollama
//! status + installed models, MLX server state (from PID files),
//! MCP server state (from supervisor snapshot + recent log tails),
//! opencode.json (with secrets redacted), and tails of the supervisor /
//! setup.sh logs.
//!
//! The output is plain text so the frontend can drop it straight into
//! navigator.clipboard.writeText() — no special clipboard plugin needed.

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

const REDACTED_KEYS: &[&str] = &["api_key", "apiKey", "token", "secret", "password"];
const LOG_TAIL_BYTES: usize = 8 * 1024; // 8 KB per log file

fn user_data_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .ok()
}

fn section(name: &str, body: String) -> String {
    format!("\n=== {name} ===\n{body}\n")
}

fn probe(cmd: &str, arg: &str) -> String {
    match Command::new(cmd).arg(arg).output() {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => format!("<{cmd} {arg}: unavailable>"),
    }
}

fn tail_file(path: &Path, bytes: usize) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    let len = metadata.len() as usize;
    let start = len.saturating_sub(bytes);
    let mut data = fs::read(path).ok()?;
    if start > 0 {
        data.drain(..start);
    }
    Some(String::from_utf8_lossy(&data).to_string())
}

fn redact(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (k, v) in map.iter_mut() {
                if REDACTED_KEYS.iter().any(|r| k.eq_ignore_ascii_case(r)) {
                    *v = Value::String("<redacted>".into());
                } else {
                    redact(v);
                }
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                redact(v);
            }
        }
        _ => {}
    }
}

fn ollama_block() -> String {
    let version = match ureq::get("http://127.0.0.1:11434/api/version").call() {
        Ok(r) => r
            .into_json::<serde_json::Value>()
            .ok()
            .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| "<unknown>".into()),
        Err(e) => return format!("running: no ({e})\n"),
    };
    let tags = match ureq::get("http://127.0.0.1:11434/api/tags").call() {
        Ok(r) => r.into_json::<serde_json::Value>().ok(),
        Err(_) => None,
    };
    let models: Vec<String> = tags
        .and_then(|v| v.get("models").cloned())
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.into_iter()
                .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let mut out = format!("running: yes\nversion: {version}\nmodels ({}):\n", models.len());
    for m in &models {
        out.push_str(&format!("  - {m}\n"));
    }
    out
}

fn mlx_block(data_dir: &Path) -> String {
    let mlx_dir = data_dir.join("mlx");
    if !mlx_dir.exists() {
        return "no MLX state dir\n".into();
    }
    let mut out = String::new();
    let Ok(entries) = fs::read_dir(&mlx_dir) else {
        return "<unreadable>\n".into();
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if path.extension().and_then(|s| s.to_str()) == Some("pid") {
            let pid = fs::read_to_string(&path).unwrap_or_default().trim().to_string();
            let alive = if let Ok(p) = pid.parse::<i32>() {
                // Safety: just a no-op signal check (0 = existence check)
                let status = Command::new("kill").arg("-0").arg(p.to_string()).status();
                matches!(status, Ok(s) if s.success())
            } else {
                false
            };
            out.push_str(&format!(
                "{name}: pid={pid} running={alive}\n",
            ));
            let log = mlx_dir.join(format!("{name}.log"));
            if let Some(tail) = tail_file(&log, LOG_TAIL_BYTES) {
                let trimmed: String = tail
                    .lines()
                    .rev()
                    .take(15)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join("\n");
                out.push_str("  last log lines:\n");
                for line in trimmed.lines() {
                    out.push_str(&format!("    {line}\n"));
                }
            }
        }
    }
    if out.is_empty() {
        out.push_str("no MLX PID files\n");
    }
    out
}

fn mcp_block(data_dir: &Path) -> String {
    let mut out = String::new();
    for id in ["cocoindex", "mempalace", "graphify", "context-mode"] {
        let venv_python = data_dir
            .join("mcp-bin")
            .join(id)
            .join("venv")
            .join("bin")
            .join("python");
        out.push_str(&format!(
            "{id}: venv={} ({})\n",
            venv_python.display(),
            if venv_python.exists() {
                "installed"
            } else {
                "NOT INSTALLED (will create on first use)"
            }
        ));
    }
    out
}

fn opencode_json_block(data_dir: &Path) -> String {
    let path = data_dir.join("opencode.json");
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => return format!("<unreadable: {e}>\n"),
    };
    let mut value: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return format!("<unparseable: {e}>\n"),
    };
    redact(&mut value);
    match serde_json::to_string_pretty(&value) {
        Ok(pretty) => pretty + "\n",
        Err(e) => format!("<serialize error: {e}>\n"),
    }
}

fn setup_log_block() -> String {
    // setup.log lives at the repo root relative to this Rust crate.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|root| root.join("setup.log"));
    match candidate {
        Some(p) if p.exists() => tail_file(&p, LOG_TAIL_BYTES).unwrap_or_default(),
        _ => "<no setup.log at repo root>\n".into(),
    }
}

#[tauri::command]
pub fn oo_collect_diagnostics(app: AppHandle) -> String {
    let data_dir = user_data_dir(&app).unwrap_or_default();
    let mut report = String::new();

    report.push_str(&section(
        "OpenOptimized",
        format!(
            "timestamp: {}\nmacOS: {}\nrustc: {}\nnode: {}\npnpm: {}\npython3.12: {}\nbun: {}\n",
            chrono_iso(),
            probe("sw_vers", "-productVersion"),
            probe("rustc", "--version"),
            probe("node", "--version"),
            probe("pnpm", "--version"),
            probe("python3.12", "--version"),
            probe("bun", "--version"),
        ),
    ));

    report.push_str(&section("Ollama", ollama_block()));
    report.push_str(&section("MLX servers", mlx_block(&data_dir)));
    report.push_str(&section("MCP servers (setup state)", mcp_block(&data_dir)));
    report.push_str(&section(
        "opencode.json (secrets redacted)",
        opencode_json_block(&data_dir),
    ));
    report.push_str(&section("setup.log tail", setup_log_block()));

    report
}

fn chrono_iso() -> String {
    // Avoid pulling in chrono; use UNIX-epoch-based ISO-ish string.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("epoch={now}")
}
