# resources/mcp-bin/

Per-MCP staging dirs. Built from `vendor/<repo>/` submodules by
`scripts/build-mcp-bins.sh`. **Generated content is gitignored**; only this
README stays tracked.

## Layout per MCP (after build)

```
resources/mcp-bin/<name>/
  source/           clean copy of vendor/<repo>/ source (no .git, no tests)
  run.sh            launcher invoked by OpenCode via opencode.json
  setup.sh          first-launch installer (creates venv under $APPSUPPORT,
                    pip-installs from source/, idempotent on re-run)
  MANIFEST.json     { name, source, pinned_sha, runtime, entrypoint }
```

## How launches work at runtime

1. OpenCode reads `$APPSUPPORT/OpenOptimized/opencode.json`. Each MCP's
   `command` is `["bash", "<app-resources>/mcp-bin/<name>/run.sh"]`.
2. `run.sh` checks for the per-user venv under
   `$APPSUPPORT/OpenOptimized/mcp-bin/<name>/venv/`. If missing, it invokes
   `setup.sh` to create the venv and `pip install -e ../source`.
3. Once the venv exists, `run.sh` activates it and `exec`s the MCP's
   entrypoint (e.g., `cocoindex-code mcp`, `python -m graphify.serve`,
   `node cli.bundle.mjs`).

The `.app` ships the source; the user's machine holds the venv. This keeps
the bundle machine-independent and the venv platform-correct.

## Pinned SHAs (as of current submodule state)

| MCP | Upstream | Runtime | Entrypoint |
|-----|----------|---------|------------|
| cocoindex | jaycdave88/cocoindex-code | python | `cocoindex-code mcp` |
| mempalace | jaycdave88/mempalace | python | `python -m mempalace.mcp_server` |
| graphify  | jaycdave88/graphify | python | `python -m graphify.serve` |
| context-mode | jaycdave88/context-mode | node | `node cli.bundle.mjs` |

Bumping a pin is a regular submodule update:

```bash
git submodule update --remote vendor/<repo>
./scripts/build-mcp-bins.sh <name>
```

## Why source-based instead of prebuilt binaries?

See `UPSTREAM.md` and `LICENSES.md`. Short answer: the upstream repos
don't all publish tagged release binaries, and vendoring source keeps our
build hermetic and reproducible without waiting on upstream release
cadence.
