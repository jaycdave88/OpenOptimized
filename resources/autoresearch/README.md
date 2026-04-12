# resources/autoresearch/

autoresearch (jaycdave88/autoresearch) sidecar. Populated by
`scripts/bootstrap-python-sidecars.sh` into a venv at
`$APPSUPPORT/OpenOptimized/autoresearch/venv/`.

Exposed to the UI as a **mode** (`Research`) via `ModeSwitcher`. Runs are
persisted under `$APPSUPPORT/OpenOptimized/autoresearch/runs/<id>/`.

See `@oo/research` for the Node-side wrapper.
