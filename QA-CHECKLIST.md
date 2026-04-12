# QA checklist for OpenOptimized

Run this on a clean Mac before cutting a release. Each item has a
one-line "pass" definition so there's no ambiguity about what "works"
means. Group ordering is roughly the order a new user encounters them.

## 0. Build

- [ ] `git clone --recursive` of the repo finishes without submodule
      errors.
- [ ] `pnpm install` completes with no missing-dep warnings.
- [ ] `./scripts/smoke.sh --offline` passes.
- [ ] `./scripts/build-mac.sh` produces
      `apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/OpenOptimized.app`.
- [ ] `ls OpenOptimized.app/Contents/MacOS/` shows all sidecars:
      `opencode`, `openwork-server`, `openwork-orchestrator`,
      `opencode-router`, `chrome-devtools-mcp`, `oo-supervisor`.

## 1. First launch (empty `~/Library/Application Support/dev.openoptimized.app/`)

- [ ] Right-click → Open the `.app`. Gatekeeper warning appears once;
      after confirming, window opens.
- [ ] Onboarding overlay shows **System check** step with
      Python/Ollama/Node/Git statuses.
- [ ] If Ollama is missing, the **Install Ollama** button opens
      `ollama.com/download/mac` in the browser.
- [ ] Continuing through the flow reaches the **Bringing up MCP servers**
      step; all four servers turn green within ~60 s.
- [ ] Overlay dismisses cleanly. Relaunching the app does NOT show the
      overlay again (`localStorage` flag set).
- [ ] `~/Library/Application Support/dev.openoptimized.app/` now contains:
      `opencode.json`, `.opencode/agents/` with three seed personas,
      `mcp-bin/<name>/venv/` for each MCP.

## 2. Chat against Ollama

- [ ] `ollama pull qwen2.5-coder:14b` (if not already) — model appears in
      the model picker.
- [ ] Send a prompt: "where is the auth flow in this repo?" on a sample
      repo. CocoIndex gets tool-called; results cite real file:line.
- [ ] Ask: "remember that I prefer async/await style" → next session's
      prompt honors the preference (MemPalace round-trip).

## 3. Settings tabs (one per panel)

### Models
- [ ] Lists installed Ollama models with size.
- [ ] Clicking **pull** on `nomic-embed-text` streams progress bar.

### MCP servers
- [ ] All four show status = up, with PID.
- [ ] Click **restart** on `cocoindex`; status briefly flips to
      `starting`, then back to `up`.
- [ ] `kill -9` one MCP process manually; its row flips to `crashed`,
      then recovers within the backoff window.

### Agent library
- [ ] Shows 187 personas from vendor/agency-agents.
- [ ] Filter by "security" narrows the list.
- [ ] Click **install** on one; it appears under
      `.opencode/agents/` on disk.

### Plugins
- [ ] Lists the 10 curated awesome-opencode plugins.
- [ ] Click **install** on a plugin; yellow banner appears with
      **Restart OpenCode** button.
- [ ] Clicking restart returns the banner to idle; verify
      `jq .plugin ~/Library/.../opencode.json` includes the spec.
- [ ] Click **remove**; spec disappears from opencode.json.

### Extras
- [ ] Flash-MoE row shows hardware hint; **Install** runs the clone and
      displays NDJSON log in the rollup. Status flips to installed.
- [ ] MicroFish-En **Install** clones + bootstraps venv; **Launch**
      opens `127.0.0.1:5000` in the default browser.

## 4. Modes (ModeSwitcher)

- [ ] Composer shows the four-mode segmented switcher (Chat / Plan /
      Review / Research).
- [ ] Switching to **Plan (DeerFlow)** triggers the Python venv bootstrap
      for deerflow if missing; user sees a progress hint.
- [ ] Switching to **Research** triggers the same flow for autoresearch.

## 5. Lifecycle

- [ ] Quit app → relaunch. Session history, memory, and code indexes
      persist.
- [ ] Ollama killed while chatting → Models panel reflects it as "not
      running"; existing session surface a clear error rather than
      hanging.
- [ ] `rm -rf ~/Library/.../mcp-bin/cocoindex/venv` → next chat
      recreates the venv (setup.sh runs) and resumes.

## 6. Vendor drift (pre-release)

- [ ] `./scripts/upstream-diff.sh` lists ahead counts per vendored repo.
- [ ] `./scripts/upstream-diff.sh --full` shows oneline log per repo.
- [ ] No commits look security-critical without being reviewed; if they
      do, bump that submodule before releasing.

## 7. Regression spots (historically fragile)

- [ ] Right-click → Open still works after notarization status changes.
- [ ] On Ollama cold start (after reboot), Models panel detects it
      within the first refresh cycle (≤10 s).
- [ ] Plugin installed before a restart doesn't crash the session; the
      restart simply activates it on next prompt.
- [ ] `opencode.json` hand-edits (e.g., commenting out a provider) are
      preserved across `oo_bootstrap` (it's append-only for missing
      keys).
