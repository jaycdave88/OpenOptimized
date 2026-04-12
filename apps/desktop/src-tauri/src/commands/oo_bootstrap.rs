//! OpenOptimized first-run bootstrap.
//!
//! Idempotent: safe to call on every launch.
//!
//! 1. Copy `resources/opencode.defaults.json` to
//!    `$APPSUPPORT/OpenOptimized/opencode.json` if it doesn't exist,
//!    rewriting `__RESOURCE__` placeholders in `command` arrays to
//!    absolute paths inside the resolved resources dir.
//! 2. Copy `resources/agents/*.md` into
//!    `$APPSUPPORT/OpenOptimized/.opencode/agents/` (only missing files).
//!
//! A mirror of the same logic lives in `packages/@oo/config` for use from
//! tests and the Node sidecar; keep them in sync.

use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct BootstrapResult {
    pub created_opencode_json: bool,
    pub merged_opencode_keys: Vec<String>,
    pub copied_agents: u32,
    pub user_data_dir: String,
    pub resources_dir: String,
}

fn user_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("could not resolve app data dir: {e}"))
}

fn resources_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // In prod the bundled resources land under `<AppBundle>/Resources`; in
    // dev we fall back to the repo's top-level `resources/` directory.
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("resources");
        if candidate.exists() {
            return Ok(candidate);
        }
        if dir.exists() {
            return Ok(dir);
        }
    }
    // Dev fallback: walk up from CARGO_MANIFEST_DIR.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .ok_or_else(|| "could not resolve repo root in dev".to_string())?;
    Ok(repo_root.join("resources"))
}

fn rewrite_resource_placeholders(content: &str, resources: &Path) -> String {
    content.replace("__RESOURCE__", &resources.display().to_string())
}

fn copy_if_missing(src: &Path, dest: &Path) -> Result<bool, String> {
    if dest.exists() {
        return Ok(false);
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(src, dest).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Merge two JSON values preserving user state. For each key in `defaults`:
///   - if absent in `target`, copy it from defaults
///   - if both are objects, recurse (so `provider.ollama` is added even
///     when `provider.mlx-r1-uncensored` already exists)
///   - otherwise leave `target`'s value untouched (user wins)
///
/// Returns the list of top-level keys that were added or deep-merged.
fn smart_merge(target: &mut Value, defaults: &Value) -> Vec<String> {
    let mut touched = Vec::new();
    if let (Some(target_obj), Some(defaults_obj)) =
        (target.as_object_mut(), defaults.as_object())
    {
        for (key, default_val) in defaults_obj {
            match target_obj.get_mut(key) {
                None => {
                    target_obj.insert(key.clone(), default_val.clone());
                    touched.push(key.clone());
                }
                Some(existing) => {
                    if existing.is_object() && default_val.is_object() {
                        let sub = smart_merge(existing, default_val);
                        if !sub.is_empty() {
                            touched.push(key.clone());
                        }
                    }
                    // otherwise user's value wins — do nothing
                }
            }
        }
    }
    touched
}

#[tauri::command]
pub fn oo_bootstrap(app: AppHandle) -> Result<BootstrapResult, String> {
    let user_dir = user_data_dir(&app)?;
    let resources = resources_dir(&app)?;

    // 1. opencode.json — smart-merge defaults into whatever already exists
    //    (or create from scratch if missing). Users may have previously run
    //    register-mlx-providers.sh which creates a stub opencode.json with
    //    only the MLX entries; this ensures the Ollama provider + bundled
    //    MCPs still land even when that file pre-exists.
    let defaults_src = resources.join("opencode.defaults.json");
    let opencode_dest = user_dir.join("opencode.json");
    let (created_opencode_json, merged_opencode_keys) = if defaults_src.exists() {
        let raw = fs::read_to_string(&defaults_src).map_err(|e| e.to_string())?;
        let rewritten = rewrite_resource_placeholders(&raw, &resources);
        let defaults: Value =
            serde_json::from_str(&rewritten).map_err(|e| format!("parse defaults: {e}"))?;

        if opencode_dest.exists() {
            let existing_raw =
                fs::read_to_string(&opencode_dest).map_err(|e| e.to_string())?;
            let mut existing: Value = serde_json::from_str(&existing_raw)
                .unwrap_or_else(|_| Value::Object(Map::new()));
            if !existing.is_object() {
                existing = Value::Object(Map::new());
            }
            let touched = smart_merge(&mut existing, &defaults);
            if !touched.is_empty() {
                let pretty = serde_json::to_string_pretty(&existing)
                    .map_err(|e| e.to_string())?;
                fs::write(&opencode_dest, pretty).map_err(|e| e.to_string())?;
            }
            (false, touched)
        } else {
            if let Some(parent) = opencode_dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let pretty = serde_json::to_string_pretty(&defaults)
                .map_err(|e| e.to_string())?;
            fs::write(&opencode_dest, pretty).map_err(|e| e.to_string())?;
            (true, Vec::new())
        }
    } else {
        (false, Vec::new())
    };

    // 2. Seed agent personas.
    let agents_src = resources.join("agents");
    let agents_dest = user_dir.join(".opencode").join("agents");
    let mut copied_agents = 0u32;
    if agents_src.exists() {
        for entry in fs::read_dir(&agents_src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
                continue;
            }
            let name = entry.file_name();
            // Skip internal README etc.; only copy .md persona files.
            if !name.to_string_lossy().ends_with(".md") {
                continue;
            }
            if name == "README.md" {
                continue;
            }
            let src = entry.path();
            let dest = agents_dest.join(&name);
            if copy_if_missing(&src, &dest)? {
                copied_agents += 1;
            }
        }
    }

    Ok(BootstrapResult {
        created_opencode_json,
        merged_opencode_keys,
        copied_agents,
        user_data_dir: user_dir.display().to_string(),
        resources_dir: resources.display().to_string(),
    })
}
