//! Ollama integration commands for OpenOptimized.
//!
//! These talk to the local Ollama REST API (default http://127.0.0.1:11434)
//! using the existing `ureq` dependency. Progress for `ollama_pull_model` is
//! streamed to the frontend via Tauri events (`ollama:pull:progress`).
//!
//! The base URL is resolved in priority order:
//! 1. In-memory custom endpoint (set via `ollama_set_endpoint`)
//! 2. `OLLAMA_HOST` environment variable (standard Ollama convention)
//! 3. Default: `http://127.0.0.1:11434`

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

const PROGRESS_EVENT: &str = "ollama:pull:progress";

static CUSTOM_ENDPOINT: Mutex<Option<String>> = Mutex::new(None);
/// Whether we have attempted to load the persisted endpoint file.
static PERSISTED_LOADED: Mutex<bool> = Mutex::new(false);

/// Return the path to the persisted endpoint JSON file.
fn endpoint_persist_path() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME").ok()?;
    Some(
        std::path::PathBuf::from(home)
            .join("Library/Application Support/dev.openoptimized.app/ollama-endpoint.json"),
    )
}

/// Lazily load the persisted endpoint from disk on first access.
fn ensure_persisted_loaded() {
    let mut loaded = PERSISTED_LOADED.lock().unwrap();
    if *loaded {
        return;
    }
    *loaded = true;

    if let Some(path) = endpoint_persist_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(url) = val.get("url").and_then(|v| v.as_str()) {
                    let mut ep = CUSTOM_ENDPOINT.lock().unwrap();
                    if ep.is_none() {
                        *ep = Some(url.to_string());
                    }
                }
            }
        }
    }
}

/// Resolve the Ollama base URL using the priority chain:
/// 1. In-memory custom endpoint
/// 2. `OLLAMA_HOST` env var
/// 3. Default `http://127.0.0.1:11434`
pub fn get_ollama_base() -> String {
    ensure_persisted_loaded();

    // 1. Check in-memory custom endpoint
    if let Some(url) = CUSTOM_ENDPOINT.lock().unwrap().as_ref() {
        return url.clone();
    }
    // 2. Check OLLAMA_HOST env var (standard Ollama convention)
    if let Ok(host) = std::env::var("OLLAMA_HOST") {
        if !host.is_empty() {
            if host.starts_with("http") {
                return host;
            }
            return format!("http://{}", host);
        }
    }
    // 3. Default
    "http://127.0.0.1:11434".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub modified_at: String,
    #[serde(default)]
    pub digest: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaPullProgress {
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed: Option<u64>,
}

#[tauri::command]
pub fn ollama_status() -> OllamaStatus {
    let url = format!("{}/api/version", OLLAMA_BASE);
    match ureq::get(&url).call() {
        Ok(resp) => match resp.into_json::<serde_json::Value>() {
            Ok(body) => OllamaStatus {
                running: true,
                version: body
                    .get("version")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                error: None,
            },
            Err(err) => OllamaStatus {
                running: false,
                version: None,
                error: Some(format!("parse: {err}")),
            },
        },
        Err(err) => OllamaStatus {
            running: false,
            version: None,
            error: Some(err.to_string()),
        },
    }
}

#[tauri::command]
pub fn ollama_list_models() -> Result<Vec<OllamaModel>, String> {
    let url = format!("{}/api/tags", OLLAMA_BASE);
    let resp = ureq::get(&url).call().map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let models = body
        .get("models")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
    let out: Vec<OllamaModel> = models
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();
    Ok(out)
}

/// Pulls a model from Ollama, emitting progress updates on `ollama:pull:progress`.
/// Blocks until the pull completes or errors. Callers should run this in a
/// background worker (Tauri does this automatically for async commands, and
/// synchronous commands run on the tokio blocking pool).
#[tauri::command]
pub fn ollama_pull_model(app: AppHandle, name: String) -> Result<(), String> {
    let url = format!("{}/api/pull", OLLAMA_BASE);
    let body = serde_json::json!({ "name": name, "stream": true });
    let resp = ureq::post(&url)
        .set("content-type", "application/json")
        .send_json(body)
        .map_err(|e| e.to_string())?;

    let reader = BufReader::new(resp.into_reader());
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        // Ollama emits one JSON object per line.
        if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(&line) {
            let progress = OllamaPullProgress {
                name: name.clone(),
                status: chunk
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                total: chunk.get("total").and_then(|v| v.as_u64()),
                completed: chunk.get("completed").and_then(|v| v.as_u64()),
            };
            let _ = app.emit(PROGRESS_EVENT, progress);
        }
    }
    Ok(())
}
