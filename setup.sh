#!/usr/bin/env bash
#
# setup.sh — one-shot Mac Studio bring-up for OpenOptimized
#
# Idempotent: safe to re-run. Each step checks whether it's already done
# and skips if so. Designed for a fresh macOS 13+ install on Apple Silicon.
#
# Flow (all optional but default-on):
#
#   1. Xcode CLI tools           — git, make, compilers
#   2. Homebrew                  — package manager
#   3. Node 22 + pnpm + bun      — JS/TS toolchain
#   4. Rust toolchain            — Tauri desktop build
#   5. Python 3.12               — MCP/sidecar venvs
#   6. Ollama + default models   — local inference
#   7. git submodule update      — vendor/* sources
#   8. pnpm install              — workspace deps
#   9. scripts/build-mac.sh      — universal .app
#  10. open the .app             — launch it
#
# Flags:
#   --skip-ollama       skip Ollama install entirely
#   --pull-models       also pull the default Ollama models (qwen2.5-coder:14b,
#                       nomic-embed-text). Default is NOT to pull — users with
#                       models already installed don't waste bandwidth.
#   --skip-models       (deprecated, now the default) no-op kept for back-compat
#   --skip-build        stop after deps, don't run build-mac.sh
#   --skip-launch       build but don't auto-open the .app
#   --with-python       force Python install even if python3 is present
#   --with-mlx          start MLX models defined in ./mlx-models.json and
#                       register them as OpenCode providers
#   --mlx-config PATH   path to an alternate MLX config (implies --with-mlx)
#   --skip-mlx          do not start or register MLX models even if a config exists
#   --yes               don't prompt for anything (for CI / automation)
#
# Run from the repo root:
#   ./setup.sh
#
# Log lives at ./setup.log and is also tailed to stdout.

set -euo pipefail

# ---------------------------------------------------------------------------
# Arg parsing + setup
# ---------------------------------------------------------------------------

SKIP_OLLAMA=0
PULL_MODELS=0          # default: don't pull models; user already has them locally
SKIP_BUILD=0
SKIP_LAUNCH=0
SKIP_MLX=0
WITH_MLX=0
FORCE_PYTHON=0
ASSUME_YES=0
MLX_CONFIG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-ollama) SKIP_OLLAMA=1; shift ;;
    --pull-models) PULL_MODELS=1; shift ;;
    --skip-models) shift ;;   # deprecated no-op; kept so existing invocations don't error
    --skip-build)  SKIP_BUILD=1; shift ;;
    --skip-launch) SKIP_LAUNCH=1; shift ;;
    --skip-mlx)    SKIP_MLX=1; shift ;;
    --with-python) FORCE_PYTHON=1; shift ;;
    --with-mlx)    WITH_MLX=1; shift ;;
    --mlx-config)  WITH_MLX=1; MLX_CONFIG="${2:?--mlx-config needs a path}"; shift 2 ;;
    --yes|-y)      ASSUME_YES=1; shift ;;
    -h|--help)
      sed -n '2,42p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"
ROOT="$(pwd)"
LOG="${ROOT}/setup.log"
: > "${LOG}"

RED="\033[31m"; GRN="\033[32m"; YLW="\033[33m"; CYA="\033[36m"; DIM="\033[2m"; RST="\033[0m"
step()  { printf "${CYA}==> %s${RST}\n" "$*" | tee -a "${LOG}"; }
ok()    { printf "    ${GRN}ok${RST}    %s\n" "$*" | tee -a "${LOG}"; }
skip()  { printf "    ${YLW}skip${RST}  %s\n" "$*" | tee -a "${LOG}"; }
warn()  { printf "    ${YLW}warn${RST}  %s\n" "$*" | tee -a "${LOG}"; }
fail()  { printf "    ${RED}fail${RST}  %s\n" "$*" | tee -a "${LOG}"; exit 1; }
info()  { printf "    ${DIM}%s${RST}\n" "$*" | tee -a "${LOG}"; }

confirm() {
  local prompt="$1"
  if [[ "${ASSUME_YES}" == "1" ]]; then return 0; fi
  read -r -p "    ${prompt} [Y/n] " ans
  [[ -z "${ans}" || "${ans}" =~ ^[Yy]$ ]]
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

step "Preflight"

OS="$(uname -s)"
ARCH="$(uname -m)"
if [[ "${OS}" != "Darwin" ]]; then
  fail "OpenOptimized targets macOS; detected ${OS}"
fi
ok "macOS ${ARCH}"

if [[ "${ARCH}" != "arm64" ]]; then
  warn "Apple Silicon recommended (Mac Studio M-series); Intel may work but is untested"
fi

SW_VERS="$(sw_vers -productVersion 2>/dev/null || echo unknown)"
info "macOS ${SW_VERS}"

# ---------------------------------------------------------------------------
# 1. Xcode CLI tools
# ---------------------------------------------------------------------------

step "Xcode Command Line Tools"
if xcode-select -p >/dev/null 2>&1; then
  ok "already installed at $(xcode-select -p)"
else
  info "triggering install dialog (accept the GUI prompt, then re-run this script)"
  xcode-select --install || true
  fail "install Xcode CLI tools, then re-run ./setup.sh"
fi

# ---------------------------------------------------------------------------
# 2. Homebrew
# ---------------------------------------------------------------------------

step "Homebrew"
if command -v brew >/dev/null; then
  ok "$(brew --version | head -1)"
else
  if confirm "install Homebrew?"; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" 2>&1 | tee -a "${LOG}"
    # On Apple Silicon, brew installs to /opt/homebrew — ensure it's on PATH.
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  else
    fail "Homebrew is required"
  fi
fi

# ---------------------------------------------------------------------------
# 2b. Modern bash
# macOS ships bash 3.2 (locked at that version because Apple won't update to
# GPLv3). Several of our scripts (build-mcp-bins.sh, stage-python-sidecars.sh,
# start-mlx.sh) need bash 4+ for associative arrays and mapfile. Those
# scripts auto-reexec themselves via /opt/homebrew/bin/bash when available,
# so we install it here BEFORE anything tries to call them.
# ---------------------------------------------------------------------------

step "Modern bash (Homebrew)"
if [[ -x /opt/homebrew/bin/bash ]] || [[ -x /usr/local/bin/bash ]]; then
  BREW_BASH="$(command -v /opt/homebrew/bin/bash || command -v /usr/local/bin/bash)"
  ok "$(${BREW_BASH} --version 2>/dev/null | head -1)"
else
  info "installing bash via Homebrew (system bash 3.2 is too old for build scripts)"
  brew install bash 2>&1 | tee -a "${LOG}" >/dev/null
  ok "bash installed at $(command -v /opt/homebrew/bin/bash || command -v /usr/local/bin/bash)"
fi

# ---------------------------------------------------------------------------
# 3. Node 22 + pnpm + bun
# ---------------------------------------------------------------------------

step "Node.js 22"
if command -v node >/dev/null && [[ "$(node --version)" == v22.* ]]; then
  ok "$(node --version)"
else
  info "installing node@22 via Homebrew"
  brew install node@22 2>&1 | tee -a "${LOG}" >/dev/null
  brew link --overwrite --force node@22 2>&1 | tee -a "${LOG}" >/dev/null
  ok "$(node --version)"
fi

step "pnpm 10"
if command -v pnpm >/dev/null; then
  ok "$(pnpm --version)"
else
  npm install -g pnpm@10.27.0 2>&1 | tee -a "${LOG}" >/dev/null
  ok "$(pnpm --version)"
fi

step "Bun"
if command -v bun >/dev/null; then
  ok "$(bun --version)"
else
  curl -fsSL https://bun.sh/install | bash 2>&1 | tee -a "${LOG}" >/dev/null
  # Bun installs to ~/.bun/bin; add to PATH for this session.
  export PATH="${HOME}/.bun/bin:${PATH}"
  ok "$(bun --version)"
fi

# ---------------------------------------------------------------------------
# 4. Rust toolchain (Tauri)
# ---------------------------------------------------------------------------

step "Rust toolchain"
if command -v rustup >/dev/null; then
  ok "$(rustc --version)"
else
  info "installing via rustup (default toolchain, no prompt)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable 2>&1 | tee -a "${LOG}" >/dev/null
  # shellcheck disable=SC1091
  source "${HOME}/.cargo/env"
  ok "$(rustc --version)"
fi

info "adding Apple targets (arm64 + x86_64) for universal binaries"
rustup target add aarch64-apple-darwin x86_64-apple-darwin 2>&1 | tee -a "${LOG}" >/dev/null
ok "rust targets: aarch64-apple-darwin, x86_64-apple-darwin"

# ---------------------------------------------------------------------------
# 5. Python 3.12
# ---------------------------------------------------------------------------

step "Python 3.12"
if command -v python3.12 >/dev/null; then
  ok "$(python3.12 --version)"
elif [[ "${FORCE_PYTHON}" == "1" ]] || ! command -v python3 >/dev/null; then
  brew install python@3.12 2>&1 | tee -a "${LOG}" >/dev/null
  ok "$(python3.12 --version)"
else
  warn "python3.12 missing but python3 present ($(python3 --version)); MCPs may fall back, but 3.12 is recommended"
  if confirm "install python@3.12 via Homebrew?"; then
    brew install python@3.12 2>&1 | tee -a "${LOG}" >/dev/null
    ok "$(python3.12 --version)"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Ollama
# ---------------------------------------------------------------------------

if [[ "${SKIP_OLLAMA}" == "0" ]]; then
  step "Ollama"
  OLLAMA_AVAILABLE=0
  if command -v ollama >/dev/null; then
    ok "$(ollama --version 2>&1 | head -1)"
    OLLAMA_AVAILABLE=1
  else
    if confirm "install Ollama via Homebrew cask?"; then
      brew install --cask ollama 2>&1 | tee -a "${LOG}" >/dev/null
      ok "installed"
      OLLAMA_AVAILABLE=1
    else
      skip "Ollama (OpenOptimized will boot in cloud-only / MLX-only mode)"
    fi
  fi

  # Report installed models without pulling. Users manage their own Ollama
  # catalog; setup.sh just surfaces what's already there.
  if [[ "${OLLAMA_AVAILABLE}" == "1" ]]; then
    if curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
      count="$(ollama list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')"
      if [[ "${count}" -gt 0 ]]; then
        ok "${count} local Ollama model(s) detected"
      else
        info "Ollama is running but no models are installed"
        info "use \`ollama pull <model>\` to add one, or --pull-models to fetch defaults (qwen2.5-coder:14b, nomic-embed-text)"
      fi
    else
      info "Ollama not running yet — launch Ollama.app or \`ollama serve\` before using the app"
    fi
  fi

  # Sync the list of installed Ollama models into opencode.json. Safe to
  # run even if opencode.json doesn't exist yet (the script just exits
  # early). Re-running setup.sh after pulling new Ollama models picks
  # them up automatically.
  if [[ "${OLLAMA_AVAILABLE}" == "1" ]]; then
    ./scripts/sync-ollama-models.sh 2>&1 | tee -a "${LOG}" | sed 's/^/    /'
  fi

  # Explicit opt-in model pulls. Skipped by default since users with
  # local models don't want setup.sh to re-fetch anything.
  if [[ "${OLLAMA_AVAILABLE}" == "1" && "${PULL_MODELS}" == "1" ]]; then
    step "Ollama model pulls (--pull-models)"
    if ! curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
      info "starting Ollama server in background"
      open -a Ollama 2>/dev/null || true
      sleep 2
    fi
    for model in qwen2.5-coder:14b nomic-embed-text; do
      if ollama list 2>/dev/null | grep -q "^${model}"; then
        ok "${model} already installed"
      else
        info "pulling ${model} (multi-GB; safe to ctrl-c and resume)"
        ollama pull "${model}" 2>&1 | tee -a "${LOG}" || warn "pull of ${model} failed; retry later from Settings → Models"
      fi
    done
  elif [[ "${OLLAMA_AVAILABLE}" == "1" && "${PULL_MODELS}" == "0" ]]; then
    skip "Ollama model pulls (opt-in via --pull-models)"
  fi
else
  skip "Ollama install (--skip-ollama)"
fi

# ---------------------------------------------------------------------------
# 6b. Local MLX models (optional; only if config present or --with-mlx)
# ---------------------------------------------------------------------------

MLX_CONFIG_RESOLVED=""
if [[ -n "${MLX_CONFIG}" ]]; then
  MLX_CONFIG_RESOLVED="${MLX_CONFIG}"
elif [[ -f "${ROOT}/mlx-models.json" ]]; then
  MLX_CONFIG_RESOLVED="${ROOT}/mlx-models.json"
fi

if [[ "${SKIP_MLX}" == "1" ]]; then
  skip "MLX models (--skip-mlx)"
elif [[ -n "${MLX_CONFIG_RESOLVED}" || "${WITH_MLX}" == "1" ]]; then
  step "Local MLX models"
  if [[ -z "${MLX_CONFIG_RESOLVED}" ]]; then
    warn "--with-mlx given but no ./mlx-models.json found"
    info "copy the template: cp mlx-models.example.json mlx-models.json, then re-run"
  else
    info "config: ${MLX_CONFIG_RESOLVED}"

    # mlx-lm needs Python 3.10+. We install it into an isolated venv under
    # $APPSUPPORT rather than --user — Homebrew Python 3.12 is marked
    # "externally managed" (PEP 668), which makes `pip install --user`
    # fail with a confusing error that's easy to miss. A venv sidesteps
    # that entirely and keeps mlx-lm's deps off the system Python.
    MLX_VENV="${HOME}/Library/Application Support/dev.openoptimized.app/mlx-venv"
    if [[ -x "${MLX_VENV}/bin/python" ]] && "${MLX_VENV}/bin/python" -c "import mlx_lm" >/dev/null 2>&1; then
      ok "mlx-lm present in venv: ${MLX_VENV}"
    else
      if confirm "create isolated mlx-venv and install mlx-lm?"; then
        # Build the venv (idempotent — `python -m venv` reuses if present).
        if ! python3.12 -m venv "${MLX_VENV}" 2>&1 | tee -a "${LOG}"; then
          warn "venv creation failed — see ${LOG}"
          MLX_CONFIG_RESOLVED=""
        else
          # Upgrade pip inside the venv (not --user); these are safe to
          # fail-noisily because the venv is isolated.
          "${MLX_VENV}/bin/python" -m pip install --quiet --upgrade pip 2>&1 | tee -a "${LOG}" >/dev/null || true
          if "${MLX_VENV}/bin/python" -m pip install --quiet mlx-lm 2>&1 | tee -a "${LOG}"; then
            ok "mlx-lm installed into ${MLX_VENV}"
          else
            warn "mlx-lm install failed — tail of ${LOG}:"
            tail -n 20 "${LOG}" | sed 's/^/    /'
            MLX_CONFIG_RESOLVED=""
          fi
        fi
      else
        skip "MLX servers (mlx-lm not available)"
        MLX_CONFIG_RESOLVED=""
      fi
    fi

    # Heads-up if a stale Python 3.9 install of mlx-lm exists — it's what
    # the bare `mlx_lm.server` command used to resolve to, and can cause
    # confusion during manual debugging (start-mlx.sh now invokes via the
    # venv's python, so it doesn't matter for automated runs).
    if [[ -f "${HOME}/Library/Python/3.9/bin/mlx_lm.server" ]]; then
      warn "detected stale Python 3.9 install at ~/Library/Python/3.9/bin/mlx_lm.server"
      info "start-mlx.sh uses the venv Python, so this won't interfere with our setup"
      info "remove it anyway with: python3 -m pip uninstall -y mlx-lm transformers tokenizers"
    fi

    # jq is required by both scripts; it's tiny and universally useful.
    if ! command -v jq >/dev/null; then
      info "installing jq (required by start-mlx / register-mlx scripts)"
      brew install jq 2>&1 | tee -a "${LOG}" >/dev/null
    fi

    if [[ -n "${MLX_CONFIG_RESOLVED}" ]]; then
      info "starting mlx_lm.server processes"
      if "./scripts/start-mlx.sh" "${MLX_CONFIG_RESOLVED}" 2>&1 | tee -a "${LOG}"; then
        ok "MLX servers healthy"
        info "registering MLX providers in opencode.json"
        "./scripts/register-mlx-providers.sh" "${MLX_CONFIG_RESOLVED}" 2>&1 | tee -a "${LOG}"
        ok "MLX providers registered"
      else
        warn "one or more MLX servers failed to start; see setup.log"
      fi
    fi
  fi
else
  skip "MLX models (no ./mlx-models.json and --with-mlx not set)"
fi

# ---------------------------------------------------------------------------
# 7. Submodules
# ---------------------------------------------------------------------------

step "git submodules (vendor/)"
git submodule update --init --depth=1 2>&1 | tee -a "${LOG}" >/dev/null
for repo in cocoindex-code mempalace graphify context-mode deer-flow autoresearch agency-agents; do
  if [[ -d "vendor/${repo}" ]] && git -C "vendor/${repo}" rev-parse HEAD >/dev/null 2>&1; then
    ok "vendor/${repo} @ $(git -C "vendor/${repo}" rev-parse --short HEAD)"
  else
    fail "vendor/${repo} failed to initialize"
  fi
done

# ---------------------------------------------------------------------------
# 8. pnpm install
# ---------------------------------------------------------------------------

step "pnpm install"
pnpm install 2>&1 | tee -a "${LOG}" | tail -5
ok "workspace deps installed"

# ---------------------------------------------------------------------------
# 9. Build the .app
# ---------------------------------------------------------------------------

if [[ "${SKIP_BUILD}" == "0" ]]; then
  step "Building OpenOptimized.app (Apple Silicon, unsigned)"
  info "this runs scripts/build-mac.sh — expect 5-15 minutes on first build"
  ./scripts/build-mac.sh 2>&1 | tee -a "${LOG}"
  APP_PATH=$(find apps/desktop/src-tauri/target/release/bundle/macos -maxdepth 1 -name "*.app" -print -quit 2>/dev/null || true)
  if [[ -z "${APP_PATH}" ]]; then
    fail "build finished but no .app found at expected location (see ${LOG})"
  fi
  ok "built: ${APP_PATH}"
else
  skip "build (--skip-build)"
fi

# ---------------------------------------------------------------------------
# 10. Launch
# ---------------------------------------------------------------------------

if [[ "${SKIP_BUILD}" == "0" && "${SKIP_LAUNCH}" == "0" ]]; then
  step "Launching OpenOptimized.app"
  info "first launch: macOS Gatekeeper will prompt because the build is unsigned."
  info "right-click the .app in Finder, choose Open, confirm. After that, double-click works."
  if confirm "open now?"; then
    open "${APP_PATH}"
    ok "launched"
  else
    skip "launch (run: open ${APP_PATH})"
  fi
fi

echo ""
step "setup complete"
info "log:           ${LOG}"
info "smoke test:    ./scripts/smoke.sh --offline"
info "drift audit:   ./scripts/upstream-diff.sh"
info "troubleshoot:  TROUBLESHOOTING.md"
info "QA checklist:  QA-CHECKLIST.md"
if [[ -n "${MLX_CONFIG_RESOLVED:-}" ]]; then
  info "stop MLX:      ./scripts/stop-mlx.sh"
  info "start MLX:     ./scripts/start-mlx.sh ${MLX_CONFIG_RESOLVED}"
fi
