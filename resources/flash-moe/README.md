# resources/flash-moe/

Flash-MoE (jaycdave88/flash-moe) — native Obj-C / Metal inference engine for a
397B-parameter Qwen MoE on Apple Silicon. Optional, opt-in.

## What OpenOptimized bundles

**Nothing at build time.** The Flash-MoE binary and weights are large and the
upstream license is TBD; bundling would balloon the `.app` and couple our
MIT distribution to an unknown license. Instead:

- This directory ships an `install.sh` that the user invokes (via the
  Tauri command `flash_moe_install` or from the terminal) to fetch the
  binary into `$APPSUPPORT/OpenOptimized/flash-moe/`.
- Once installed, `flash-moe` runs as a local OpenAI-compatible server on
  port `41234` (or whatever the binary prints to stdout); OpenOptimized
  registers it as a second provider alongside Ollama.

## Hardware note

Flash-MoE expects:

- Apple Silicon (M-series) Mac
- 128 GB unified memory recommended for the 397B model
- A smaller quantized variant may be offered later

On unsupported hardware the install script exits with a clear error and
the UI falls back to Ollama-only mode.

## Wiring

1. `ModelManager` shows an advanced section "Flash-MoE 397B (optional)".
2. Clicking `Install` invokes `flash_moe_install` (Tauri) which shells out
   to `resources/flash-moe/install.sh`.
3. After install, `ModelManager` reads `flash_moe_status` to determine
   whether to add the Flash-MoE provider to the model picker.
4. On session launch, if Flash-MoE is enabled and its port is up, the
   provider dropdown shows a `flash-moe/qwen-397b-moe` entry.

## Licensing

Because the Flash-MoE binary is downloaded at the end user's request (not
redistributed by us), OpenOptimized's MIT bundle is unaffected by whatever
license upstream ultimately adopts. The install script surfaces the
upstream license text before download.
