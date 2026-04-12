/**
 * @oo/ui
 *
 * OpenOptimized-specific UI primitives. Intentionally re-exports
 * `@openwork/ui` for the base primitives (buttons, list, progress, etc.) and
 * layers OpenOptimized-specific components on top in subfolders:
 *
 *   - status/  — traffic-light indicators used by McpHealthPanel
 *   - pill/    — compact status pills for chat header (model, mode)
 *   - meter/   — download/progress meters for Ollama model pulls
 *
 * Panels that compose these primitives live in `apps/app/src/app/components/features/*`
 * because they need Tauri IPC and router access.
 */

export {};
