#!/usr/bin/env bash
# shellcheck shell=bash
# Associative arrays (`declare -A`) require bash 4+. macOS ships bash 3.2.
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
# stage-python-sidecars.sh
#
# Level-C staging for Python sidecars (DeerFlow Plan-mode + autoresearch
# Research-mode). Mirrors scripts/build-mcp-bins.sh in structure:
#
#   resources/sidecar/<name>/
#     source/          clean copy of vendor/<repo>/ source (committed via submodule)
#     setup.sh         first-use installer (creates venv under $APPSUPPORT,
#                      pip-installs from source/, idempotent on re-run)
#     run.sh           launcher: activates venv and execs entrypoint
#     MANIFEST.json    { name, source, pinned_sha, runtime, entrypoint }
#
# Unlike MCP servers, these sidecars are NOT spawned at app startup. They
# boot on first use of their corresponding mode (Plan or Research) from
# the UI via the Tauri command layer, which shells out to run.sh.
#
# Run:
#   ./scripts/stage-python-sidecars.sh              # all
#   ./scripts/stage-python-sidecars.sh deerflow     # one

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="${ROOT}/resources/sidecar"

declare -A REPOS=(
  [deerflow]=deer-flow
  [autoresearch]=autoresearch
)

declare -A SOURCE_PATH=(
  [deerflow]=backend
  [autoresearch]=.
)

declare -A ENTRYPOINTS=(
  [deerflow]="python a2a_server.py"
  [autoresearch]="python train.py"
)

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=(deerflow autoresearch)
fi

echo "==> stage-python-sidecars: $(echo "${targets[@]}" | tr ' ' ',')"

git submodule update --init --depth=1 -- vendor 2>/dev/null || true

stage_one() {
  local name="$1"
  local repo="${REPOS[$name]}"
  local subpath="${SOURCE_PATH[$name]}"
  local entry="${ENTRYPOINTS[$name]}"
  local src="${ROOT}/vendor/${repo}"

  if [[ ! -d "$src" ]]; then
    echo "!! missing submodule vendor/${repo}"
    return 1
  fi

  local dst="${OUT}/${name}"
  rm -rf "$dst"
  mkdir -p "${dst}/source"

  # Copy tracked files from the chosen subpath into source/. We skip tests
  # and docs to keep the staged copy lean; the pinned SHA is captured in
  # MANIFEST.json for traceability.
  (cd "$src" && git ls-files -- "$subpath") | while read -r f; do
    case "$f" in
      */tests/*|*/__pycache__/*|docs/*|*.md) continue;;
    esac
    # When subpath is "." we keep the path as-is; otherwise strip the
    # subpath prefix so source/ mirrors the build target directly.
    local rel="$f"
    if [[ "$subpath" != "." ]]; then
      rel="${f#${subpath}/}"
    fi
    mkdir -p "${dst}/source/$(dirname "$rel")"
    cp "${src}/$f" "${dst}/source/$rel"
  done

  local sha
  sha="$(git -C "$src" rev-parse HEAD)"
  cat > "${dst}/MANIFEST.json" <<JSON
{
  "name": "${name}",
  "source": "https://github.com/jaycdave88/${repo}",
  "source_subpath": "${subpath}",
  "pinned_sha": "${sha}",
  "runtime": "python",
  "entrypoint": "${entry}",
  "staged_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

  cat > "${dst}/setup.sh" <<EOF
#!/usr/bin/env bash
# Idempotent first-use setup for the ${name} sidecar.
set -euo pipefail
HERE="\$(cd "\$(dirname "\$0")" && pwd)"
USER_DATA_DIR="\${OO_USER_DATA_DIR:-\${HOME}/Library/Application Support/dev.openoptimized.app}"
VENV_DIR="\${USER_DATA_DIR}/sidecar/${name}/venv"

if [[ -d "\${VENV_DIR}" ]]; then
  printf '{"type":"setup","name":"${name}","status":"already-installed"}\n'
  exit 0
fi

mkdir -p "\$(dirname "\${VENV_DIR}")"
if ! command -v python3.12 >/dev/null && ! command -v python3 >/dev/null; then
  printf '{"type":"error","name":"${name}","message":"python3 not found; brew install python@3.12"}\n' >&2
  exit 2
fi
PY="\$(command -v python3.12 || command -v python3)"
"\${PY}" -m venv "\${VENV_DIR}"
# shellcheck disable=SC1091
source "\${VENV_DIR}/bin/activate"
pip install --quiet --upgrade pip
if [[ -f "\${HERE}/source/pyproject.toml" ]]; then
  pip install --quiet -e "\${HERE}/source"
elif [[ -f "\${HERE}/source/requirements.txt" ]]; then
  pip install --quiet -r "\${HERE}/source/requirements.txt"
else
  printf '{"type":"warn","name":"${name}","message":"no pyproject.toml or requirements.txt in staged source"}\n'
fi
printf '{"type":"setup","name":"${name}","status":"installed","venv":"%s"}\n' "\${VENV_DIR}"
EOF

  cat > "${dst}/run.sh" <<EOF
#!/usr/bin/env bash
# Launch the ${name} sidecar. run.sh calls setup.sh if the venv is missing.
set -euo pipefail
HERE="\$(cd "\$(dirname "\$0")" && pwd)"
USER_DATA_DIR="\${OO_USER_DATA_DIR:-\${HOME}/Library/Application Support/dev.openoptimized.app}"
VENV_DIR="\${USER_DATA_DIR}/sidecar/${name}/venv"

if [[ ! -d "\${VENV_DIR}" ]]; then
  "\${HERE}/setup.sh" >&2
fi

# shellcheck disable=SC1091
source "\${VENV_DIR}/bin/activate"
cd "\${HERE}/source"
exec ${entry} "\$@"
EOF

  chmod +x "${dst}/setup.sh" "${dst}/run.sh"
  echo "---- ${name} (vendor/${repo}/${subpath}) ----"
  echo "    staged:  ${dst}/source ($(find "${dst}/source" -type f | wc -l | tr -d ' ') files)"
  echo "    pinned:  ${sha}"
}

fail=0
for t in "${targets[@]}"; do
  stage_one "$t" || fail=$((fail+1))
done

if [[ $fail -gt 0 ]]; then
  echo "!! ${fail} sidecar(s) failed"
  exit 1
fi
echo "==> done"
