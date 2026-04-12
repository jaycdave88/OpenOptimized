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
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct BootstrapResult {
    pub created_opencode_json: bool,
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

fn write_if_missing(dest: &Path, content: &str) -> Result<bool, String> {
    if dest.exists() {
        return Ok(false);
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(dest, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn oo_bootstrap(app: AppHandle) -> Result<BootstrapResult, String> {
    let user_dir = user_data_dir(&app)?;
    let resources = resources_dir(&app)?;

    // 1. opencode.json — rewrite placeholders while copying.
    let defaults_src = resources.join("opencode.defaults.json");
    let opencode_dest = user_dir.join("opencode.json");
    let created_opencode_json = if defaults_src.exists() {
        let raw = fs::read_to_string(&defaults_src).map_err(|e| e.to_string())?;
        let rewritten = rewrite_resource_placeholders(&raw, &resources);
        write_if_missing(&opencode_dest, &rewritten)?
    } else {
        false
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
        copied_agents,
        user_data_dir: user_dir.display().to_string(),
        resources_dir: resources.display().to_string(),
    })
}
