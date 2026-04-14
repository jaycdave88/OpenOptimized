//! OpenOptimized system-readiness checks.
//!
//! Surfaced during onboarding so the user sees missing prerequisites
//! (Python 3.12, Ollama, Node) with actionable install hints instead of
//! silent failures later when an MCP or sidecar tries to spawn.

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct ToolCheck {
    pub id: &'static str,
    pub name: &'static str,
    pub present: bool,
    pub version: Option<String>,
    pub install_hint: &'static str,
}

#[derive(Debug, Serialize)]
pub struct SystemReport {
    pub tools: Vec<ToolCheck>,
    pub ollama_running: bool,
}

fn version_of(cmd: &str, flag: &str) -> Option<String> {
    let output = Command::new(cmd).arg(flag).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines().next().map(|s| s.trim().to_string())
}

fn probe(cmd: &str) -> Option<String> {
    version_of(cmd, "--version")
}

fn ollama_running() -> bool {
    let base = super::ollama::get_ollama_base();
    let url = format!("{}/api/version", base);
    matches!(ureq::get(&url).call(), Ok(_))
}

#[tauri::command]
pub fn oo_system_check() -> SystemReport {
    let tools = vec![
        ToolCheck {
            id: "python312",
            name: "Python 3.12",
            present: Command::new("python3.12")
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false),
            version: probe("python3.12"),
            install_hint: "brew install python@3.12",
        },
        ToolCheck {
            id: "python3",
            name: "Python 3 (fallback)",
            present: Command::new("python3")
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false),
            version: probe("python3"),
            install_hint: "brew install python@3.12",
        },
        ToolCheck {
            id: "node",
            name: "Node.js",
            present: Command::new("node")
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false),
            version: probe("node"),
            install_hint: "brew install node",
        },
        ToolCheck {
            id: "ollama",
            name: "Ollama CLI",
            present: Command::new("ollama")
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false),
            version: probe("ollama"),
            install_hint: "brew install ollama (or download from ollama.com)",
        },
        ToolCheck {
            id: "git",
            name: "git",
            present: Command::new("git")
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false),
            version: probe("git"),
            install_hint: "xcode-select --install",
        },
    ];

    SystemReport {
        tools,
        ollama_running: ollama_running(),
    }
}
