//! OpenOptimized MCP supervisor commands.
//!
//! Spawns `apps/oo-supervisor` as a child process on first use, reads its
//! newline-delimited JSON events from stdout, and forwards them to the
//! frontend as `mcp.status` / `mcp.stderr` / `mcp.ready` Tauri events.
//!
//! Supervisor protocol (defined in apps/oo-supervisor/README.md):
//!   stdout events:  { type: "mcp.status", id, status, pid?, restarts, lastError? }
//!                   { type: "mcp.stderr", id, chunk }
//!                   { type: "ready", registered: [...] }
//!                   { type: "config.missing", ... }
//!                   { type: "shutdown" } / { type: "fatal", error }
//!   stdin commands: { type: "status" }
//!                   { type: "restart", id }
//!                   { type: "stop", id }

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

const STATUS_EVENT: &str = "mcp.status";
const STDERR_EVENT: &str = "mcp.stderr";
const READY_EVENT: &str = "mcp.ready";

struct SupervisorChild {
    _child: Child,
    stdin: ChildStdin,
    snapshot: Vec<McpStateSnapshot>,
}

fn supervisor() -> &'static Mutex<Option<SupervisorChild>> {
    static SUPERVISOR: OnceLock<Mutex<Option<SupervisorChild>>> = OnceLock::new();
    SUPERVISOR.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum McpStatus {
    Starting,
    Up,
    Down,
    Crashed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpStateSnapshot {
    pub id: String,
    pub status: McpStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(default)]
    pub restarts: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

fn user_data_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .ok()
}

/// Locate the bundled oo-supervisor binary. In prod it's under
/// `<AppBundle>/Contents/MacOS/oo-supervisor` (via Tauri's externalBin
/// placement). In dev we fall back to the compiled output under
/// `apps/oo-supervisor/dist/bin/`.
fn resolve_supervisor_bin(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        for candidate in [
            resource_dir.join("oo-supervisor"),
            resource_dir.join("sidecars").join("oo-supervisor"),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest.parent()?.parent()?.parent()?;
    let dev = repo_root
        .join("apps")
        .join("oo-supervisor")
        .join("dist")
        .join("bin")
        .join("oo-supervisor");
    if dev.exists() {
        return Some(dev);
    }
    None
}

fn spawn_supervisor(app: &AppHandle) -> Result<(), String> {
    let mut guard = supervisor().lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    let bin = resolve_supervisor_bin(app)
        .ok_or_else(|| "oo-supervisor binary not found; run scripts/build-mac.sh".to_string())?;
    let data_dir = user_data_dir(app).ok_or_else(|| "app data dir unavailable".to_string())?;

    let mut child = Command::new(&bin)
        .env("OO_USER_DATA_DIR", &data_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn {} failed: {e}", bin.display()))?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let stdin = child.stdin.take().ok_or("no stdin")?;

    // stdout reader — forward each event line to the UI.
    {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if line.is_empty() {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                let kind = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
                match kind {
                    "mcp.status" => {
                        if let Ok(snap) =
                            serde_json::from_value::<McpStateSnapshot>(value.clone())
                        {
                            if let Ok(mut guard) = supervisor().lock() {
                                if let Some(s) = guard.as_mut() {
                                    update_snapshot(&mut s.snapshot, snap.clone());
                                }
                            }
                            let _ = app.emit(STATUS_EVENT, snap);
                        }
                    }
                    "mcp.stderr" => {
                        let _ = app.emit(STDERR_EVENT, value);
                    }
                    "ready" => {
                        let _ = app.emit(READY_EVENT, value);
                    }
                    _ => {
                        // config.missing / shutdown / fatal / snapshot — forward raw.
                        let _ = app.emit(STATUS_EVENT, value);
                    }
                }
            }
        });
    }

    // stderr reader — anything here is a supervisor-level error (not an
    // MCP child stderr; that comes through mcp.stderr events on stdout).
    {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app.emit(
                    "mcp.supervisor.stderr",
                    serde_json::json!({ "line": line }),
                );
            }
        });
    }

    *guard = Some(SupervisorChild {
        _child: child,
        stdin,
        snapshot: Vec::new(),
    });
    Ok(())
}

fn update_snapshot(snapshot: &mut Vec<McpStateSnapshot>, new: McpStateSnapshot) {
    if let Some(existing) = snapshot.iter_mut().find(|s| s.id == new.id) {
        *existing = new;
    } else {
        snapshot.push(new);
    }
}

fn send_command(cmd: Value) -> Result<(), String> {
    let mut guard = supervisor().lock().map_err(|e| e.to_string())?;
    let s = guard.as_mut().ok_or("supervisor not spawned yet")?;
    let line = format!("{}\n", cmd.to_string());
    s.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    s.stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the current snapshot. If the supervisor hasn't been spawned
/// yet, we spawn it here and return an empty list — the UI will update
/// as soon as the first `mcp.status` event fires.
#[tauri::command]
pub fn oo_mcp_status(app: AppHandle) -> Vec<McpStateSnapshot> {
    let _ = spawn_supervisor(&app);
    supervisor()
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.snapshot.clone()))
        .unwrap_or_default()
}

#[tauri::command]
pub fn oo_mcp_restart(app: AppHandle, id: String) -> Result<(), String> {
    spawn_supervisor(&app)?;
    send_command(serde_json::json!({ "type": "restart", "id": id }))
}

/// Explicit boot helper — the frontend can call this from the setup flow
/// to start the supervisor without waiting for the first oo_mcp_status.
#[tauri::command]
pub fn oo_mcp_boot(app: AppHandle) -> Result<(), String> {
    spawn_supervisor(&app)
}
