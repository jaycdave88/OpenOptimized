#!/usr/bin/env bash
#
# build-mac.sh
#
# Produce a universal unsigned OpenOptimized.app for macOS.
#
# Steps:
#   1. Install pnpm deps.
#   2. Fetch MCP binaries for arm64 + x86_64 (cocoindex, mempalace, graphify,
#      context-mode) per the manifest in scripts/fetch-mcp-bins.ts.
#   3. Build the React UI.
#   4. Run `tauri build --target universal-apple-darwin` which produces a
#      universal .app under apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/.
#   5. Print the final path so CI can upload it.
#
# Unsigned: no --sign / --notarize flags. First-launch instructions in
# README cover right-click → Open to bypass Gatekeeper.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "==> OpenOptimized Mac build"
echo "    root: ${ROOT}"

if ! command -v pnpm >/dev/null; then
  echo "!! pnpm not found. Install: npm install -g pnpm@10.27.0" >&2
  exit 1
fi
if ! command -v cargo >/dev/null; then
  echo "!! cargo (Rust toolchain) not found. Install: https://rustup.rs" >&2
  exit 1
fi

echo "==> pnpm install"
pnpm install --frozen-lockfile

echo "==> Ensuring both Apple targets are installed"
rustup target add aarch64-apple-darwin x86_64-apple-darwin

echo "==> Initializing vendor/ submodules (MCP + sidecar + personas)"
git submodule update --init --depth=1 -- vendor

echo "==> Staging MCP servers from vendor/ sources"
./scripts/build-mcp-bins.sh

echo "==> Staging Python sidecars (DeerFlow, autoresearch)"
./scripts/stage-python-sidecars.sh

echo "==> Staging agency-agents catalog"
rm -rf resources/agency-agents
mkdir -p resources/agency-agents
# Mirror the upstream layout (categories/<category>/*.md) into resources/;
# the Rust `agency_agents_list` command reads from here in prod builds.
for d in vendor/agency-agents/*/; do
  cat="$(basename "${d}")"
  case "${cat}" in .*|scripts|integrations) continue;; esac
  mkdir -p "resources/agency-agents/${cat}"
  cp -R "${d}"*.md "resources/agency-agents/${cat}/" 2>/dev/null || true
done

echo "==> Compiling oo-supervisor sidecar binary"
pnpm --filter oo-supervisor run build:bin

echo "==> Running OpenWork's sidecar build chain (opencode, openwork-server, orchestrator, opencode-router, chrome-devtools-mcp)"
# This produces every other sidecar declared in tauri.conf.json externalBin
# by invoking each workspace's build:bin:bundled / prepare-sidecar flow.
pnpm --filter openwork-orchestrator run build:sidecars

echo "==> Staging sidecars into apps/desktop/src-tauri/sidecars/"
node apps/desktop/scripts/prepare-sidecar.mjs
# Copy our own oo-supervisor next to the OpenWork sidecars.
mkdir -p apps/desktop/src-tauri/sidecars
cp apps/oo-supervisor/dist/bin/oo-supervisor apps/desktop/src-tauri/sidecars/oo-supervisor 2>/dev/null || \
  echo "!! oo-supervisor build output missing — Tauri bundle will skip this externalBin"

echo "==> Building UI"
pnpm build:ui

echo "==> Tauri universal build (unsigned)"
pnpm tauri build --target universal-apple-darwin --no-bundle=false

OUT_DIR="${ROOT}/apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos"
echo "==> Bundle output:"
ls -la "${OUT_DIR}" || true
APP_PATH=$(find "${OUT_DIR}" -maxdepth 1 -name "*.app" -print -quit || true)
if [[ -z "${APP_PATH}" ]]; then
  echo "!! No .app produced at ${OUT_DIR}" >&2
  exit 1
fi
echo "==> OpenOptimized.app: ${APP_PATH}"
echo ""
echo "First launch: right-click the .app, choose Open, confirm the dialog."
echo "This is an unsigned build — Gatekeeper will warn on first launch only."
