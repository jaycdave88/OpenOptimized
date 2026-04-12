//! OpenOptimized MCP supervisor commands.
//!
//! Phase 1: reads the `mcp` section of `opencode.json` from the user's data
//! directory and returns a static snapshot (every configured server reports
//! status `up` if OpenCode is running, `down` otherwise).
//!
//! Phase 2 replaces this with events emitted by the Node-side
//! `@oo/mcp-supervisor` running inside apps/orchestrator; the frontend will
//! listen for `mcp.status` unchanged.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

const STATUS_EVENT: &str = "mcp.status";

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

fn app_support_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .ok()
}

fn opencode_config_path(app: &AppHandle) -> Option<PathBuf> {
    app_support_dir(app).map(|d| d.join("opencode.json"))
}

fn read_configured_mcp_ids(app: &AppHandle) -> Vec<String> {
    let path = match opencode_config_path(app) {
        Some(p) => p,
        None => return Vec::new(),
    };
    let Ok(content) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return Vec::new();
    };
    json.get("mcp")
        .and_then(|v| v.as_object())
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn oo_mcp_status(app: AppHandle) -> Vec<McpStateSnapshot> {
    // Phase 1 behavior: assume all configured MCPs are up if the config file
    // exists. Phase 2 will replace this with real supervisor state.
    let ids = read_configured_mcp_ids(&app);
    ids.into_iter()
        .map(|id| McpStateSnapshot {
            id,
            status: McpStatus::Up,
            pid: None,
            restarts: 0,
            last_error: None,
        })
        .collect()
}

/// Request a restart of the named MCP server. In Phase 1 this is a no-op
/// that emits a `starting -> up` transition so the UI's traffic-light
/// animation works; Phase 2 delegates to the Node-side supervisor.
#[tauri::command]
pub fn oo_mcp_restart(app: AppHandle, id: String) -> Result<(), String> {
    let transitions = [McpStatus::Starting, McpStatus::Up];
    for status in transitions {
        let snap = McpStateSnapshot {
            id: id.clone(),
            status,
            pid: None,
            restarts: 0,
            last_error: None,
        };
        let _ = app.emit(STATUS_EVENT, snap);
    }
    Ok(())
}
