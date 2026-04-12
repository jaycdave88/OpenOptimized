#!/usr/bin/env bash
#
# scripts/diagnostics.sh — CLI mirror of the in-app `oo_collect_diagnostics`
# Tauri command. Works even if the app UI is unresponsive or not running.
#
# Prints a plain-text report to stdout. Pipe or redirect as you like:
#
#   ./scripts/diagnostics.sh                      # print to terminal
#   ./scripts/diagnostics.sh | pbcopy             # copy to clipboard (macOS)
#   ./scripts/diagnostics.sh > oo-diag.txt        # save to file
#
# Content matches the Rust command: versions, Ollama, MLX, MCP setup state,
# opencode.json with secrets redacted, setup.log tail.

set -u

USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

section() { printf "\n=== %s ===\n%s\n" "$1" "$2"; }

probe() {
  local cmd="$1" arg="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    "$cmd" "$arg" 2>/dev/null | head -1
  else
    echo "<$cmd not on PATH>"
  fi
}

has_jq=1
command -v jq >/dev/null 2>&1 || has_jq=0

# ---------------------------------------------------------------------------
# Base environment
# ---------------------------------------------------------------------------
env_body=$(
  printf "timestamp:  %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf "macOS:      %s\n" "$(sw_vers -productVersion 2>/dev/null)"
  printf "arch:       %s\n" "$(uname -m)"
  printf "rustc:      %s\n" "$(probe rustc --version)"
  printf "node:       %s\n" "$(probe node --version)"
  printf "pnpm:       %s\n" "$(probe pnpm --version)"
  printf "python3.12: %s\n" "$(probe python3.12 --version)"
  printf "bun:        %s\n" "$(probe bun --version)"
  printf "bash:       %s\n" "${BASH_VERSION}"
)
section "OpenOptimized" "${env_body}"

# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------
ollama_body=""
if curl -s --max-time 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  version=$(curl -s http://127.0.0.1:11434/api/version 2>/dev/null | (jq -r .version 2>/dev/null || echo "<unknown>"))
  ollama_body="running:    yes"$'\n'"version:    ${version}"$'\n'"models:"
  if [[ "${has_jq}" -eq 1 ]]; then
    models=$(curl -s http://127.0.0.1:11434/api/tags | jq -r '.models[]?.name // empty' 2>/dev/null)
  else
    models=""
  fi
  if [[ -n "${models}" ]]; then
    while IFS= read -r m; do
      ollama_body+=$'\n'"  - ${m}"
    done <<< "${models}"
  else
    ollama_body+=$'\n'"  (none installed, or jq not available to parse)"
  fi
else
  ollama_body="running: no (127.0.0.1:11434 unreachable)"
fi
section "Ollama" "${ollama_body}"

# ---------------------------------------------------------------------------
# MLX servers
# ---------------------------------------------------------------------------
mlx_body=""
mlx_dir="${USER_DATA_DIR}/mlx"
if [[ -d "${mlx_dir}" ]]; then
  shopt -s nullglob
  for pid_file in "${mlx_dir}"/*.pid; do
    name=$(basename "${pid_file}" .pid)
    pid=$(cat "${pid_file}" 2>/dev/null || echo "")
    alive="dead"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      alive="alive"
    fi
    mlx_body+="${name}: pid=${pid} status=${alive}"$'\n'
    log="${mlx_dir}/${name}.log"
    if [[ -f "${log}" ]]; then
      mlx_body+="  last 15 log lines:"$'\n'
      mlx_body+="$(tail -n 15 "${log}" 2>/dev/null | sed 's/^/    /')"$'\n'
    fi
  done
  shopt -u nullglob
  if [[ -z "${mlx_body}" ]]; then
    mlx_body="no PID files in ${mlx_dir}"
  fi
else
  mlx_body="no MLX state dir (${mlx_dir})"
fi
section "MLX servers" "${mlx_body}"

# ---------------------------------------------------------------------------
# MCP servers (setup state)
# ---------------------------------------------------------------------------
mcp_body=""
for id in cocoindex mempalace graphify context-mode; do
  venv_py="${USER_DATA_DIR}/mcp-bin/${id}/venv/bin/python"
  if [[ -x "${venv_py}" ]]; then
    mcp_body+="${id}: venv installed"$'\n'
  else
    mcp_body+="${id}: venv NOT installed (will create on first use)"$'\n'
  fi
done
section "MCP servers (setup state)" "${mcp_body}"

# Is oo-supervisor alive?
super_body="<not detected>"
if command -v pgrep >/dev/null; then
  pids=$(pgrep -fl oo-supervisor 2>/dev/null | grep -v diagnostics || true)
  if [[ -n "${pids}" ]]; then
    super_body="${pids}"
  fi
fi
section "oo-supervisor processes" "${super_body}"

# ---------------------------------------------------------------------------
# opencode.json (secrets redacted)
# ---------------------------------------------------------------------------
oc_body=""
oc_path="${USER_DATA_DIR}/opencode.json"
if [[ -f "${oc_path}" ]]; then
  if [[ "${has_jq}" -eq 1 ]]; then
    oc_body=$(jq 'walk(if type == "object" then with_entries(if (.key | ascii_downcase | IN("api_key","apikey","token","secret","password")) then .value = "<redacted>" else . end) else . end)' "${oc_path}" 2>/dev/null)
    if [[ -z "${oc_body}" ]]; then
      oc_body="<jq failed; raw contents, potentially unsanitized:>"$'\n'"$(cat "${oc_path}")"
    fi
  else
    oc_body="<jq not available; install via: brew install jq>"$'\n'"$(cat "${oc_path}")"
  fi
else
  oc_body="<missing: ${oc_path}>"
fi
section "opencode.json (secrets redacted)" "${oc_body}"

# ---------------------------------------------------------------------------
# setup.log tail
# ---------------------------------------------------------------------------
setup_log="${ROOT_DIR}/setup.log"
if [[ -f "${setup_log}" ]]; then
  section "setup.log tail" "$(tail -n 80 "${setup_log}")"
else
  section "setup.log" "<not found at ${setup_log}>"
fi

# ---------------------------------------------------------------------------
# Recent MCP supervisor stderr (if the app is running)
# ---------------------------------------------------------------------------
log_candidates=(
  "${HOME}/Library/Logs/OpenOptimized/supervisor.log"
  "${USER_DATA_DIR}/supervisor.log"
)
for lf in "${log_candidates[@]}"; do
  if [[ -f "${lf}" ]]; then
    section "supervisor log: ${lf}" "$(tail -n 50 "${lf}")"
  fi
done
