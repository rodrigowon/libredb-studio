# Agent Instructions

This is the tool-independent entrypoint for work on the custom LibreDB Studio fork.
Repository code and tests establish current behavior; dated notes and plans do not override them.
If instructions and implementation disagree, report the difference before changing either.

## Start here

Read in this order, then follow the references relevant to the task:

1. [Current state](docs/CURRENT_STATE.md): product direction, snapshot, gaps and next checkpoints.
2. [Architecture](docs/ARCHITECTURE.md): application boundaries and runtime behavior.
3. [Decisions](docs/DECISIONS.md): accepted choices and their consequences.
4. [Database providers](docs/DATABASE_PROVIDERS.md): visibility, contracts and authoring.
5. [Toolchain](docs/TOOLCHAIN.md) and [testing guide](README.md#testing): validation and isolation.
6. [Upstream strategy](docs/UPSTREAM_STRATEGY.md) before any upstream comparison or integration.

## Product

A browser-first, self-hosted database studio derived from LibreDB, with a deliberately focused
product surface. The current product definition and language direction live in
[Current state](docs/CURRENT_STATE.md#product-direction); do not infer the fork's roadmap or
published artifacts from inherited upstream marketing and package metadata.

## Critical rules

- Inspect Git status, current code and relevant tests before editing. Work on the user-designated
  branch and preserve unrelated changes. Commit, stage, publish or integrate only within the
  authorized task. Never resolve divergence with a destructive Git operation without authorization.
- Treat browser state, SQL, database content and model output as untrusted input. Security decisions
  must be server-authoritative; hidden UI, confirmation dialogs and provider visibility are not access controls.
- Check the [safety and lifecycle gaps](docs/CURRENT_STATE.md#incomplete-and-unsafe-areas) before
  making safety claims or adding connection controls. Do not expose a fake disconnected state.
- Use [the central provider visibility configuration](docs/DATABASE_PROVIDERS.md#provider-visibility-in-this-fork).
  Do not remove shipped providers, capabilities, dependencies or hidden persisted connections because
  the default UI does not offer them. Prefer capabilities/labels over new engine-specific UI branches.
- Keep provider implementation, per-type documentation and corresponding tests in sync under
  [provider conventions](docs/providers/README.md#conventions). Preserve provider contracts unless
  a task explicitly requires a reviewed change.
- Keep UI translations in locale catalogs. Do not translate SQL, database identifiers, user content,
  raw database errors or technical names. Follow [runtime localization](docs/ARCHITECTURE.md#410-localization);
  a product language decision alone does not authorize changing its default.
- Preserve [server-side EXPLAIN semantics](docs/API_DOCS.md#structured-explain-requests).
  An explicit analyze request can execute the underlying statement.
- Review upstream changes selectively using [Upstream strategy](docs/UPSTREAM_STRATEGY.md).
  Do not merge upstream wholesale into the custom product branch.
- Never edit, format, rename, move, delete, stage or commit `docs/FORK_BASELINE.md` or
  `docs/INTERNAL_ARCHITECTURE_MAP.md`. They are private local historical files, not canonical docs
  or destinations for new documentation. If present, verify they remain untracked and unchanged.
  A fresh clone need not contain them; do not recreate them.
- Do not put credentials, local databases, personal paths or private connection details in documentation.
  Use disposable fixtures or user-designated test databases for validation.
- Keep technical documentation in English. Give each fact one canonical home and link to it.
  Update the current-state snapshot after a reviewed checkpoint; do not copy a chat transcript into it.

## Validation

[Package scripts](package.json), [CI](.github/workflows/ci.yml) and
[Toolchain](docs/TOOLCHAIN.md#ci-and-pre-commit-integration) define the checks. For code changes,
run the relevant isolated tests, typecheck, lint and build; complete the applicable CI gates before
claiming the full gate set passed. Report failures and checks not run explicitly.

Preserve the isolation in [core](tests/run-core.sh) and [component](tests/run-components.sh) runners:
Bun module mocks are process-wide. Do not combine isolated groups into one test invocation.
Coverage policy and measurement are documented in [Toolchain](docs/TOOLCHAIN.md#coverage-measurement-100-line-coverage-held-since-2026-07-14).
For changes reachable from `src/exports/`, also run `bun run build:lib`; the Next.js build does
not produce the library. Run the two builds sequentially. Shared UI needs checks in standalone
Studio and embedded StudioWorkspace, with browser checks when behavior or appearance changes.

For documentation-only tasks, inspect the diff, validate local links, run the relevant lightweight
documentation checks and `git diff --check`; do not run expensive suites unless tooling is affected.
Before Next.js code changes, read the relevant installed guide under `node_modules/next/dist/docs/`.

## Current work

[Current state](docs/CURRENT_STATE.md#immediate-next-sequence) owns the active sequence.
This entrypoint does not authorize starting the next checkpoint.
