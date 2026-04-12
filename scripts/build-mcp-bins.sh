#!/usr/bin/env bash
# shellcheck shell=bash
# This script uses associative arrays (`declare -A`), which need bash 4+.
# macOS ships bash 3.2, so we auto-reexec with Homebrew's bash when
# available.
if [[ "${BASH_VERSINFO:-0}" -lt 4 ]]; then
  for candidate in /opt/homebrew/bin/bash /usr/local/bin/bash; do
    if [[ -x "$candidate" ]]; then
      exec "$candidate" "$0" "$@"
    fi
  done
  echo "error: this script needs bash 4+. Install via: brew install bash" >&2
  echo "       currently running: ${BASH_VERSION:-unknown}" >&2
  exit 1
fi
#
# build-mcp-bins.sh
#
# Level-B build-from-source orchestrator for the four bundled MCP servers.
# Replaces the old `fetch-mcp-bins.ts` stub (which waited on upstream
# release binaries). Each server is now a first-class git submodule under
# `vendor/` and built from source into `resources/mcp-bin/<name>/`.
#
# Output layout per MCP:
#
#   resources/mcp-bin/<name>/
#     source/          source copy from vendor/<name>/ (minus .git, tests)
#     run.sh           launcher invoked by OpenCode via opencode.json
#     setup.sh         first-launch installer (creates venv / installs deps
#                      in user's $APPSUPPORT; runs once, idempotent)
#     MANIFEST.json    pinned SHA + upstream repo for provenance
#
# Run:
#   ./scripts/build-mcp-bins.sh              # all
#   ./scripts/build-mcp-bins.sh cocoindex    # one
#
# Exits 0 on success; non-zero on any per-MCP failure (continues the rest).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="${ROOT}/resources/mcp-bin"

declare -A REPOS=(
  [cocoindex]=cocoindex-code
  [mempalace]=mempalace
  [graphify]=graphify
  [context-mode]=context-mode
)

declare -A RUNTIMES=(
  [cocoindex]=python
  [mempalace]=python
  [graphify]=python
  [context-mode]=node
)

declare -A ENTRYPOINTS=(
  [cocoindex]="cocoindex-code mcp"
  [mempalace]="python -m mempalace.mcp_server"
  [graphify]="python -m graphify.serve"
  [context-mode]="node cli.bundle.mjs"
)

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=(cocoindex mempalace graphify context-mode)
fi

echo "==> build-mcp-bins: $(echo "${targets[@]}" | tr ' ' ',')"

# Ensure submodules are populated (idempotent).
git submodule update --init --depth=1 -- vendor 2>/dev/null || true

stage_source() {
  local name="$1" repo="$2"
  local src="${ROOT}/vendor/${repo}"
  local dst="${OUT}/${name}/source"
  [[ -d "$src" ]] || { echo "!! missing submodule: vendor/${repo}"; return 1; }
  mkdir -p "$dst"
  # Copy tracked files only (not .git; exclude tests/docs to keep bundle lean).
  (cd "$src" && git ls-files) | while read -r f; do
    case "$f" in
      tests/*|benchmarks/*|examples/*|docs/*|"*.md") continue;;
    esac
    mkdir -p "$dst/$(dirname "$f")"
    cp "$src/$f" "$dst/$f"
  done
}

write_manifest() {
  local name="$1" repo="$2"
  local src="${ROOT}/vendor/${repo}"
  local sha
  sha="$(git -C "$src" rev-parse HEAD)"
  cat > "${OUT}/${name}/MANIFEST.json" <<JSON
{
  "name": "${name}",
  "source": "https://github.com/jaycdave88/${repo}",
  "pinned_sha": "${sha}",
  "runtime": "${RUNTIMES[$name]}",
  "entrypoint": "${ENTRYPOINTS[$name]}",
  "staged_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
}

write_scripts_python() {
  local name="$1"
  local entry="${ENTRYPOINTS[$name]}"
  local dir="${OUT}/${name}"

  cat > "${dir}/setup.sh" <<EOF
#!/usr/bin/env bash
# Idempotent first-launch setup for the ${name} MCP server.
# Called by @oo/mcp-supervisor when VENV_DIR/ is missing.
set -euo pipefail
HERE="\$(cd "\$(dirname "\$0")" && pwd)"
USER_DATA_DIR="\${OO_USER_DATA_DIR:-\${HOME}/Library/Application Support/dev.openoptimized.app}"
VENV_DIR="\${USER_DATA_DIR}/mcp-bin/${name}/venv"

if [[ -d "\${VENV_DIR}" ]]; then
  printf '{"type":"setup","name":"${name}","status":"already-installed"}\n'
  exit 0
fi

mkdir -p "\$(dirname "\${VENV_DIR}")"

if ! command -v python3.12 >/dev/null && ! command -v python3 >/dev/null; then
  printf '{"type":"error","name":"${name}","message":"python3 not found"}\n' >&2
  exit 2
fi
PY="\$(command -v python3.12 || command -v python3)"

"\${PY}" -m venv "\${VENV_DIR}"
# shellcheck disable=SC1091
source "\${VENV_DIR}/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet -e "\${HERE}/source"
printf '{"type":"setup","name":"${name}","status":"installed","venv":"%s"}\n' "\${VENV_DIR}"
EOF

  cat > "${dir}/run.sh" <<EOF
#!/usr/bin/env bash
# Launch the ${name} MCP server from the user-local venv.
set -euo pipefail
HERE="\$(cd "\$(dirname "\$0")" && pwd)"
USER_DATA_DIR="\${OO_USER_DATA_DIR:-\${HOME}/Library/Application Support/dev.openoptimized.app}"
VENV_DIR="\${USER_DATA_DIR}/mcp-bin/${name}/venv"

if [[ ! -d "\${VENV_DIR}" ]]; then
  "\${HERE}/setup.sh" >&2
fi

# shellcheck disable=SC1091
source "\${VENV_DIR}/bin/activate"
exec ${entry} "\$@"
EOF

  chmod +x "${dir}/setup.sh" "${dir}/run.sh"
}

write_scripts_node() {
  local name="$1"
  local dir="${OUT}/${name}"
  local entry="${ENTRYPOINTS[$name]}"

  cat > "${dir}/setup.sh" <<EOF
#!/usr/bin/env bash
# Idempotent first-launch setup for ${name} (Node runtime).
set -euo pipefail
if ! command -v node >/dev/null; then
  printf '{"type":"error","name":"${name}","message":"node not found"}\n' >&2
  exit 2
fi
printf '{"type":"setup","name":"${name}","status":"runtime-available","node":"%s"}\n' "\$(node --version)"
EOF

  cat > "${dir}/run.sh" <<EOF
#!/usr/bin/env bash
# Launch the ${name} MCP server (Node runtime, prebuilt bundle).
set -euo pipefail
HERE="\$(cd "\$(dirname "\$0")" && pwd)"
cd "\${HERE}/source"
exec ${entry} "\$@"
EOF

  chmod +x "${dir}/setup.sh" "${dir}/run.sh"
}

build_one() {
  local name="$1"
  local repo="${REPOS[$name]}"
  local runtime="${RUNTIMES[$name]}"
  echo "---- ${name} (${runtime}; vendor/${repo}) ----"
  rm -rf "${OUT}/${name}"
  mkdir -p "${OUT}/${name}"
  stage_source "${name}" "${repo}" || return 1
  write_manifest "${name}" "${repo}"
  case "${runtime}" in
    python) write_scripts_python "${name}";;
    node)   write_scripts_node   "${name}";;
    *) echo "!! unknown runtime: ${runtime}"; return 1;;
  esac
  echo "    staged:  ${OUT}/${name}/source ($(find "${OUT}/${name}/source" -type f | wc -l | tr -d ' ') files)"
  echo "    manifest: $(jq -r .pinned_sha "${OUT}/${name}/MANIFEST.json" 2>/dev/null || echo "written")"
}

fail=0
for t in "${targets[@]}"; do
  build_one "$t" || fail=$((fail+1))
done

if [[ $fail -gt 0 ]]; then
  echo "!! ${fail} MCP(s) failed"
  exit 1
fi
echo "==> done"
