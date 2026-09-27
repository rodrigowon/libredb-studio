# Claude Code entrypoint

Read [AGENTS.md](AGENTS.md) first and follow its canonical reading order and working rules.
[Current state](docs/CURRENT_STATE.md), [Decisions](docs/DECISIONS.md) and
[Upstream strategy](docs/UPSTREAM_STRATEGY.md) apply to all agents and tools.
This file is a compatibility entrypoint, not a second project state or policy document.

The existing `.claude/agents`, `.claude/skills` and settings are tool-specific upstream assets.
Their presence does not authorize delegation, release operations or upstream integration.

The framework-managed block below is retained because `next dev` regenerates it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
