//! OpenOptimized extras: commands for optional/opt-in integrations that
//! aren't part of the core Ollama + bundled-MCP path.
//!
//!   - flash_moe_status / flash_moe_install  — native MoE inference path
//!   - microfish_status / microfish_install / microfish_launch
//!     — AGPL-isolated multi-agent doc-to-sim service
//!   - oo_plugins_list  — curated awesome-opencode shortlist
//!
//! All install/launch operations run the scripts shipped under resources/;
//! they are user-initiated (no background side effects on app launch).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

// ---------------------------------------------------------------------------
// Path resolution (same pattern used in oo_bootstrap.rs).
// ---------------------------------------------------------------------------

fn user_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("could not resolve app data dir: {e}"))
}

fn resources_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("resources");
        if candidate.exists() {
            return Ok(candidate);
        }
        if dir.exists() {
            return Ok(dir);
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .ok_or_else(|| "could not resolve repo root in dev".to_string())?;
    Ok(repo_root.join("resources"))
}

// ---------------------------------------------------------------------------
// Flash-MoE — native MoE inference engine.
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtraStatus {
    pub id: String,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
}

fn read_marker(path: &Path, id: &str) -> ExtraStatus {
    match fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(v) => ExtraStatus {
                id: id.to_string(),
                installed: true,
                target: v
                    .get("target")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                installed_at: v
                    .get("installed_at")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                license: v
                    .get("license")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
            },
            Err(_) => ExtraStatus {
                id: id.to_string(),
                installed: false,
                target: None,
                installed_at: None,
                license: None,
            },
        },
        Err(_) => ExtraStatus {
            id: id.to_string(),
            installed: false,
            target: None,
            installed_at: None,
            license: None,
        },
    }
}

#[tauri::command]
pub fn flash_moe_status(app: AppHandle) -> Result<ExtraStatus, String> {
    let data = user_data_dir(&app)?;
    Ok(read_marker(&data.join("flash-moe").join("INSTALLED.json"), "flash-moe"))
}

#[tauri::command]
pub fn flash_moe_install(app: AppHandle) -> Result<(), String> {
    let resources = resources_dir(&app)?;
    let script = resources.join("flash-moe").join("install.sh");
    if !script.exists() {
        return Err(format!("installer missing: {}", script.display()));
    }
    stream_shell_json(&app, "flash-moe.install", &script, &[])
}

// ---------------------------------------------------------------------------
// MicroFish-En — AGPL-isolated multi-agent doc platform.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn microfish_status(app: AppHandle) -> Result<ExtraStatus, String> {
    let data = user_data_dir(&app)?;
    Ok(read_marker(&data.join("microfish").join("INSTALLED.json"), "microfish"))
}

#[tauri::command]
pub fn microfish_install(app: AppHandle) -> Result<(), String> {
    let resources = resources_dir(&app)?;
    let script = resources.join("microfish").join("install.sh");
    if !script.exists() {
        return Err(format!("installer missing: {}", script.display()));
    }
    stream_shell_json(&app, "microfish.install", &script, &[])
}

#[tauri::command]
pub fn microfish_launch(app: AppHandle) -> Result<(), String> {
    let resources = resources_dir(&app)?;
    let script = resources.join("microfish").join("launch.sh");
    if !script.exists() {
        return Err(format!("launcher missing: {}", script.display()));
    }
    stream_shell_json(&app, "microfish.launch", &script, &[])
}

// ---------------------------------------------------------------------------
// awesome-opencode curated plugin registry.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn oo_plugins_list(app: AppHandle) -> Result<Value, String> {
    let resources = resources_dir(&app)?;
    let path = resources.join("opencode-plugins.json");
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Agency-Agents: browse and install personas from vendor/agency-agents/.
// Vendored as a git submodule; staged into resources/agency-agents/ at build
// time (same layout as the upstream repo: categories/<category>/*.md).
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct AgencyAgent {
    pub id: String,
    pub category: String,
    pub file: String,
}

fn agency_root(app: &AppHandle) -> Result<PathBuf, String> {
    let resources = resources_dir(app)?;
    // Try staged resources first (prod bundle), then vendor/ (dev).
    let staged = resources.join("agency-agents");
    if staged.exists() {
        return Ok(staged);
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .ok_or_else(|| "repo root not found".to_string())?;
    Ok(repo_root.join("vendor").join("agency-agents"))
}

#[tauri::command]
pub fn agency_agents_list(app: AppHandle) -> Result<Vec<AgencyAgent>, String> {
    let root = agency_root(&app)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<AgencyAgent> = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let category = entry.file_name().to_string_lossy().to_string();
        // Skip vendor metadata dirs
        if category.starts_with('.') || category == "scripts" || category == "integrations" {
            continue;
        }
        for file in fs::read_dir(entry.path()).map_err(|e| e.to_string())? {
            let file = file.map_err(|e| e.to_string())?;
            let name = file.file_name().to_string_lossy().to_string();
            if !name.ends_with(".md") || name == "README.md" {
                continue;
            }
            let id = name.trim_end_matches(".md").to_string();
            out.push(AgencyAgent {
                id,
                category: category.clone(),
                file: name,
            });
        }
    }
    out.sort_by(|a, b| a.category.cmp(&b.category).then_with(|| a.id.cmp(&b.id)));
    Ok(out)
}

#[tauri::command]
pub fn agency_agents_install(app: AppHandle, id: String, category: String) -> Result<String, String> {
    let root = agency_root(&app)?;
    let file = format!("{id}.md");
    let src = root.join(&category).join(&file);
    if !src.exists() {
        return Err(format!("persona not found: {}/{}", category, file));
    }
    let user_dir = app
        .path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("user data dir: {e}"))?;
    let dest_dir = user_dir.join(".opencode").join("agents");
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join(&file);
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.display().to_string())
}

// ---------------------------------------------------------------------------
// Internal: shell out to one of the resources/*.sh scripts and forward each
// line of stdout as a Tauri event. Keeps the UI decoupled from the script
// protocol. Events are `<event_name>` with payload `{ kind, line }`.
// ---------------------------------------------------------------------------

fn stream_shell_json(
    app: &AppHandle,
    event_name: &str,
    script: &Path,
    args: &[&str],
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;

    let mut child = Command::new("bash")
        .arg(script)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;

    if let Some(out) = child.stdout.take() {
        let app = app.clone();
        let name = event_name.to_string();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if line.is_empty() {
                    continue;
                }
                // Lines are newline-delimited JSON; we re-emit with the source
                // event name. If parsing fails we still forward the raw line.
                let payload = serde_json::from_str::<Value>(&line)
                    .unwrap_or_else(|_| serde_json::json!({ "raw": line }));
                let _ = app.emit(&name, payload);
            }
        });
    }

    if let Some(err) = child.stderr.take() {
        let app = app.clone();
        let name = format!("{event_name}.stderr");
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = app.emit(&name, serde_json::json!({ "line": line }));
            }
        });
    }

    // Don't block the Tauri command thread on the child; spawn a waiter that
    // emits a final `.exit` event.
    let app = app.clone();
    let name = format!("{event_name}.exit");
    std::thread::spawn(move || {
        if let Ok(status) = child.wait() {
            let _ = app.emit(&name, serde_json::json!({ "code": status.code() }));
        }
    });

    Ok(())
}
