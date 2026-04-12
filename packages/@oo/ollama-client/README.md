# @oo/ollama-client

Minimal wrapper around the local Ollama REST API.

**Status:** Phase 1 skeleton. Used by the Tauri commands `ollama_status`,
`ollama_list_models`, `ollama_pull_model`, and by the `ModelManager` UI.

## API surface

- `detect()` — `GET /api/version`; returns `{ running, version }`.
- `listModels()` — `GET /api/tags`.
- `pullModel(name, onProgress)` — `POST /api/pull` with streamed progress
  (newline-delimited JSON).

## Defaults expected

Default models bootstrap writes into `opencode.json`:

- `qwen2.5-coder:14b` — primary chat/coding model
- `nomic-embed-text` — embeddings for CocoIndex
- `llama3.1:8b` — lightweight fallback for onboarding smoke test
