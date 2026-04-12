# resources/agents/

Agent persona files copied to `$APPSUPPORT/OpenOptimized/.opencode/agents/` on
first run. OpenCode picks them up automatically; the `AgentLibrary` panel
toggles them per session.

## Seeded personas

- `repo-navigator.md` — fast orientation, prefers MCP search.
- `refactor-planner.md` — plans refactors, does not edit.
- `security-reviewer.md` — OWASP-oriented review, reads MemPalace for prior findings.

## Adding more

Additional personas live upstream at **jaycdave88/agency-agents**. On bootstrap
we copy a curated subset; power users can drop more files into
`.opencode/agents/` at any time.
