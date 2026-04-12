#!/usr/bin/env bash
#
# smoke.sh
#
# Quick end-to-end sanity check. Meant to be run on a dev machine where
# Ollama is installed; in CI we only run the no-network parts.
#
#   ./scripts/smoke.sh             # all checks
#   ./scripts/smoke.sh --offline   # skip Ollama probes
#
# Exits 0 if every check passes, 1 on the first failure. Each check prints
# a one-line status.

set -euo pipefail

OFFLINE=0
if [[ "${1:-}" == "--offline" ]]; then OFFLINE=1; fi

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

pass() { printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; exit 1; }
skip() { printf "  \033[33mSKIP\033[0m  %s\n" "$1"; }

echo "==> Repo structure"
for d in apps/app apps/desktop apps/orchestrator apps/oo-supervisor packages/@oo/mcp-supervisor packages/@oo/ollama-client packages/@oo/config packages/@oo/research resources/agents resources/flash-moe resources/microfish resources/deerflow resources/autoresearch vendor/cocoindex-code vendor/mempalace vendor/graphify vendor/context-mode; do
  if [[ -d "${ROOT}/${d}" ]]; then pass "${d}"; else fail "missing ${d}"; fi
done

echo "==> Submodule pins (vendor/)"
for repo in cocoindex-code mempalace graphify context-mode deer-flow autoresearch agency-agents; do
  if git -C "${ROOT}/vendor/${repo}" rev-parse HEAD >/dev/null 2>&1; then
    pass "vendor/${repo} at $(git -C "${ROOT}/vendor/${repo}" rev-parse --short HEAD)"
  else
    fail "vendor/${repo} not initialized"
  fi
done

echo "==> build-mcp-bins staging"
if bash "${ROOT}/scripts/build-mcp-bins.sh" >/tmp/smoke-build.log 2>&1; then
  pass "build-mcp-bins.sh --all"
else
  fail "build-mcp-bins.sh failed (see /tmp/smoke-build.log)"
fi
for name in cocoindex mempalace graphify context-mode; do
  for f in source run.sh setup.sh MANIFEST.json; do
    if [[ -e "${ROOT}/resources/mcp-bin/${name}/${f}" ]]; then
      pass "mcp-bin/${name}/${f}"
    else
      fail "missing mcp-bin/${name}/${f}"
    fi
  done
done

echo "==> stage-python-sidecars"
if bash "${ROOT}/scripts/stage-python-sidecars.sh" >/tmp/smoke-sidecar.log 2>&1; then
  pass "stage-python-sidecars.sh --all"
else
  fail "stage-python-sidecars.sh failed (see /tmp/smoke-sidecar.log)"
fi
for name in deerflow autoresearch; do
  for f in source run.sh setup.sh MANIFEST.json; do
    if [[ -e "${ROOT}/resources/sidecar/${name}/${f}" ]]; then
      pass "sidecar/${name}/${f}"
    else
      fail "missing sidecar/${name}/${f}"
    fi
  done
done

echo "==> agency-agents catalog reachable"
count=$(find "${ROOT}/vendor/agency-agents" -name "*.md" -not -path "*/.git/*" -not -name "README.md" 2>/dev/null | wc -l | tr -d ' ')
if [[ "${count}" -gt 100 ]]; then pass "vendor/agency-agents personas: ${count}"; else fail "agency-agents too small (got ${count})"; fi

echo "==> Critical files"
for f in LICENSE LICENSES.md UPSTREAM.md README.md resources/opencode.defaults.json resources/opencode-plugins.json resources/flash-moe/install.sh resources/microfish/install.sh resources/microfish/launch.sh scripts/build-mac.sh scripts/fetch-mcp-bins.ts scripts/bootstrap-python-sidecars.sh apps/desktop/src-tauri/src/commands/ollama.rs apps/desktop/src-tauri/src/commands/oo_mcp.rs apps/desktop/src-tauri/src/commands/oo_bootstrap.rs apps/desktop/src-tauri/src/commands/oo_extras.rs; do
  if [[ -f "${ROOT}/${f}" ]]; then pass "${f}"; else fail "missing ${f}"; fi
done

echo "==> Tauri commands wired in invoke_handler"
for cmd in ollama_status ollama_list_models ollama_pull_model oo_mcp_status oo_mcp_restart oo_bootstrap flash_moe_status flash_moe_install microfish_status microfish_install microfish_launch oo_plugins_list agency_agents_list agency_agents_install; do
  if grep -q "${cmd}" "${ROOT}/apps/desktop/src-tauri/src/lib.rs"; then pass "invoke_handler ${cmd}"; else fail "${cmd} not in lib.rs"; fi
done

echo "==> Settings tabs registered"
for tab in models mcp agents plugins extras; do
  if grep -q "\"${tab}\"" "${ROOT}/apps/app/src/app/types.ts"; then pass "SettingsTab ${tab}"; else fail "${tab} not in types.ts"; fi
done

echo "==> UI feature panels"
for panel in models/ModelManager mcp/McpHealthPanel agents/AgentLibrary plugins/PluginsBrowser extras/ExtrasPanel onboarding/Setup mode/ModeSwitcher; do
  if [[ -f "${ROOT}/apps/app/src/app/components/features/${panel}.tsx" ]]; then pass "features/${panel}.tsx"; else fail "missing features/${panel}.tsx"; fi
done

echo "==> Integration matrix — all 10 repos reachable"
for token in cocoindex mempalace graphify context-mode agency deer-flow autoresearch flash-moe MicroFish-En awesome-opencode; do
  if grep -q -i "${token}" "${ROOT}/README.md"; then pass "README mentions ${token}"; else fail "README missing ${token}"; fi
done

echo "==> opencode.defaults.json schema"
python3 - <<PY
import json, sys
p = "${ROOT}/resources/opencode.defaults.json"
with open(p) as f:
  cfg = json.load(f)
assert "provider" in cfg and "ollama" in cfg["provider"], "missing ollama provider"
assert "mcp" in cfg, "missing mcp block"
for s in ("cocoindex", "mempalace", "graphify", "context-mode"):
  assert s in cfg["mcp"], f"missing mcp server: {s}"
print(f"  provider count: {len(cfg['provider'])}, mcp count: {len(cfg['mcp'])}")
PY
pass "opencode.defaults.json valid"

echo "==> Agent personas"
count=$(ls "${ROOT}/resources/agents"/*.md 2>/dev/null | grep -v README | wc -l | tr -d ' ')
if [[ "${count}" -lt 3 ]]; then fail "expected >=3 agent personas, got ${count}"; else pass "agent personas: ${count}"; fi

echo "==> Ollama probe"
if [[ "${OFFLINE}" -eq 1 ]]; then
  skip "offline mode"
else
  if curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
    pass "ollama reachable"
  else
    skip "ollama not running (install: brew install ollama)"
  fi
fi

echo ""
echo "\033[32mSmoke checks complete.\033[0m"
