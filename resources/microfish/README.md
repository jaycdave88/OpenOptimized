# resources/microfish/

MicroFish-En (jaycdave88/MicroFish-En) — doc → multi-agent simulation platform.
Flask + Vue full-stack service, native Ollama support. **AGPL-3.0 upstream.**

## License isolation — critical

OpenOptimized's bundle is MIT. AGPL requires that modifications to the
software be offered under AGPL to anyone interacting with it over a
network. To keep OpenOptimized's MIT status intact, MicroFish-En is:

1. **Never bundled in the `.app`.** The installer clones it into the
   user's data dir at the user's request.
2. **Run as a detached process** with its own venv. We do not load
   MicroFish Python code into OpenOptimized's Node/Rust processes.
3. **Accessed over localhost HTTP only.** OpenOptimized's UI opens the
   MicroFish web UI in the user's default browser (or an external window).
   No OpenOptimized code depends on MicroFish modules.
4. **Attributed.** `LICENSES.md` lists MicroFish-En as a user-installed,
   out-of-process AGPL service that OpenOptimized provides a launcher for
   — not redistributed as part of the bundle.

This is the same legal posture as a user running a separate AGPL service
on their machine and an MIT app merely linking out to it.

## Flow

1. User opens Settings → Advanced → "Install MicroFish-En (AGPL, optional)".
2. Tauri command `microfish_install` runs `resources/microfish/install.sh`,
   which clones the repo into `$APPSUPPORT/OpenOptimized/microfish/repo/`
   and bootstraps a Python venv.
3. Tauri command `microfish_launch` runs `resources/microfish/launch.sh`,
   which starts the Flask backend and Vue dev server on localhost ports.
4. OpenOptimized opens the local URL in the default browser (not in-app
   webview, to reinforce the "separate program" boundary).
5. Stop with `microfish_stop` or just closing the process.

## Ollama coupling

MicroFish-En talks to Ollama directly; OpenOptimized doesn't bridge any
calls. If Ollama is running, MicroFish picks it up via its own config.
