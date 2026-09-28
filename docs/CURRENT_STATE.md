# Current state of the custom fork

Snapshot refreshed on **2026-09-28**, after the reviewed Apple Store PostgreSQL lab fixture
commit and before its documentation checkpoint.
This is a handoff snapshot, not a live status page or changelog. Refresh it after reviewed
checkpoints; verify Git and code on arrival. Git stores the history.

## Git snapshot

| Item | Observed value |
| --- | --- |
| Working branch | `feat/dbstudio-custom` |
| HEAD / latest closed implementation checkpoint | `277fa1fd53e01af04e5c72307d91ca908eca0ce9` — `test: add deterministic postgres apple store fixture` |
| Tracking branch | `origin/feat/dbstudio-custom` |
| Divergence from local tracking ref | ahead 6 / behind 0 (before this documentation commit) |
| `origin` | `https://github.com/rodrigowon/libredb-studio.git` |
| `upstream` | `https://github.com/libredb/libredb-studio.git` |
| Local `main`, `origin/main`, `upstream/main` | `8266a9f1c4938d14d87c1472fada16c4ade86ab6` |
| Merge-base of HEAD and `upstream/main` | `04fd78a4dfc828f636294ec33889c00b4abc774b` |
| Working tree after the fixture commit | No tracked or staged edits; only the two protected local historical documents were untracked |

No fetch was performed for this audit: remote-tracking refs above are local observations, not a
claim about GitHub's current tip. The custom branch has selective adaptations after its baseline;
an updated `main` does not mean those upstream changes are integrated into the product branch.
See [Upstream strategy](UPSTREAM_STRATEGY.md).

The protected files are named and governed in [AGENTS.md](../AGENTS.md#critical-rules).
They must remain untracked and untouched. The full HEAD above was resolved directly by Git.

## Product direction

The custom product is a browser-first, self-hosted-first, lightweight and practical database studio:
**simple on the surface, professional in depth**. It is not an attempt to rebuild DataGrip or
accumulate every engine and feature. Its guiding question is:

> Does this make it easier to open, understand, and work with the database?

The main experience exposes PostgreSQL, MySQL and SQLite by default. The broader shipped
provider architecture remains available; [visibility](DATABASE_PROVIDERS.md#provider-visibility-in-this-fork)
is a presentation policy, not an execution allowlist.

**Product direction: English primary, Brazilian Portuguese secondary.** This is an accepted
direction, not a completed default-locale migration. **Current runtime: `pt-BR` default, `en`
fallback**, as verified in [locale configuration](../src/i18n/config.ts). Both catalogs exist;
remaining English strings under pt-BR are not evidence of a completed language switch. The
cookie, server/client resolution and fallback mechanism are documented in
[Architecture](ARCHITECTURE.md#410-localization). Changing the runtime default is a separate task.

**Open-source first:** keep the GitHub project public while the product matures; self-hosting is
the current primary deployment model. Discreet voluntary support/donations are acceptable.
Billing, paywalls and a Free/Pro architecture are not current scope. Avoid unnecessarily blocking
a future hosted/commercial offering, but no SaaS design or commercialization schedule is decided.
This is product policy, not verification of GitHub repository visibility or a deployed donation flow.

## Implemented customizations

The following are present in the custom branch, verified against code, relevant tests and Git history.
Their presence does not imply every inherited feature has been audited or translated.

| Area | Current behavior and evidence |
| --- | --- |
| Provider visibility | Reusable configuration/filtering, with hidden saved connections preserved. [Implementation](../src/lib/database-visibility.ts), [tests](../tests/unit/lib/database-visibility.test.ts), [reference](DATABASE_PROVIDERS.md#provider-visibility-in-this-fork). |
| Localization | `next-intl`, two catalogs, server/client integration, locale persistence and switchers. Catalogs cover login/metadata, Studio/Connections/Editor, Results/History/data tools, schema docs/diff, Monitoring/Admin/Operations/Security/Audit, ERD/Explain, Query Safety and Agent. [Catalogs](../messages/en/), [i18n tests](../tests/unit/i18n/), [architecture](ARCHITECTURE.md#410-localization). |
| Navigation and connection workflow | Simplified primary navigation/tabs; engines and essential fields first in ConnectionModal, optional advanced fields collapsed. [Studio components](../src/components/studio/), [ConnectionModal](../src/components/ConnectionModal.tsx). |
| Execution controls and empty states | Clearer Execute/EXPLAIN controls and guidance in the main workflow. This did not resolve the shortcut limitation below. [Editor](../src/components/QueryEditor.tsx), [execution hook](../src/hooks/use-query-execution.ts), [BottomPanel](../src/components/studio/BottomPanel.tsx). |
| Results on Demand (Phase 7B.6C) | Implemented in Studio and StudioWorkspace; compact initial panel with explicit expansion. [Central controller](../src/hooks/use-bottom-panel.ts), [controller tests](../tests/hooks/use-bottom-panel.test.ts). |
| Login and header | Refined login and desktop/mobile top chrome, without new branding or auth semantics. [Login](../src/app/login/page.tsx), [desktop header](../src/components/studio/StudioDesktopHeader.tsx), [mobile header](../src/components/studio/StudioMobileHeader.tsx). |
| Explorer sidebar | Initial width 20%, minimum 15%, manual resize retained; duplicate Studio footer GitHub/version removed. Schema tools live in the Explorer bar's vertical ellipsis menu. [Layout constants](../src/components/sidebar/layout.ts), [Sidebar](../src/components/sidebar/Sidebar.tsx), [SchemaTools](../src/components/sidebar/SchemaTools.tsx). |
| ERD | Fork-specific canvas and relationship styling; details in the next section. |
| Server-side EXPLAIN | Server chooses the strategy from connected provider capabilities; estimate and explicit analyze are distinct. [API contract](API_DOCS.md#structured-explain-requests), [checkpoint detail](EXPLAIN_SERVER_SIDE.md). |
| Dialect-aware Schema Diff | Migration SQL generation adapted by engine; a reviewable artifact, not an automatic migration runner. [Reference](SCHEMA_DIFF.md), [tests](../tests/unit/schema-diff/). |
| Dialect-aware Create Table | Engine-specific type/default-key/DDL generation via [create-table.ts](../src/lib/create-table.ts). [Reference](CREATE_TABLE_DIALECTS.md), [tests](../tests/unit/lib/create-table.test.ts). |
| Agent grounding | PostgreSQL catalog columns aggregated per table; internal/extension object filtering and catalog fallback adapted. [Reference](AGENT_GROUNDING_CAPTURE.md), [composer](../src/lib/agent/composed-sql.ts), [snapshot consumer](../src/lib/agent/context-snapshot.ts). |
| Safe Mode groundwork | Classification corpus, conservative subset classifier and deterministic pure policy exist. Execution enforcement remains absent; see below. |

These refinements sit on the inherited Next.js Studio and embeddable workspace architecture.
Do not assume standalone UI validation also validates [StudioWorkspace](../src/workspace/).

### Results on Demand

The Bottom Panel starts in a compact **36 px** state with its navigation bar available.
Query execution expands Results after existing preflight checks; History, Saved and tools
can explicitly expand their surfaces. Accepted EXPLAIN requests use the same centralized
controller. Execution completion does not reopen a panel the user manually collapsed.

The expanded default is **60%**, with the existing **20%** minimum expanded size. The last
useful expanded size is retained in memory; no new persistence was introduced. Manual
resize/splitter behavior is preserved. Editing or clearing SQL does not automatically
expand or collapse the panel, and previous results remain available. Existing error
presentation is unchanged, including toasts for single-query execution failures.

## Current ERD state

The ERD styling checkpoint is `00306ea51adaf8248251b534acb496db3517a95e`. React Flow resolves to
**12.11.5** in [bun.lock](../bun.lock). The custom visual layer comprises
[SchemaDiagram](../src/components/SchemaDiagram.tsx), [FkEdge](../src/components/schema-diagram/FkEdge.tsx),
[TableNode](../src/components/schema-diagram/TableNode.tsx) and [theme styles](../src/styles/theme.css).

- A subtle dotted canvas has a pointer-reactive highlight, with touch/reduced-motion handling.
- Forward relations use Bezier paths; reversed/aligned endpoints use rounded SmoothStep fallback.
  This is not obstacle-avoiding routing: arbitrary node positions can still produce crossings.
- Edges use neutral gray theme tokens, rounded caps/joins and widths of 2 px normally,
  1.5 px for heuristic relations, and 2.5 px when highlighted. Existing Handles are 7 px circles;
  connection identities, cardinality and nonconnectable behavior remain intact.
- Relation labels follow existing selection/highlight logic; they are not always visible.
- React Flow attribution remains visible because no removal entitlement was established during
  review. This records the fork's decision, not a new interpretation of the library license.
- The [export pipeline](../src/components/schema-diagram/export.ts) was not modified in this
  checkpoint. PNG was visually inspected; SVG was exported and approved by the maintainer after
  the agent's local-file browser preview was blocked. The exported SVG contained the tables,
  curves and Handles; the checked SVG did not contain the PNG's selected `1:N` labels. Selection
  state matters when comparing exports. No independent agent visual approval of SVG is claimed.

## Incomplete and unsafe areas

Status meanings: **IMPLEMENTED** = present in source; **PARTIAL** = some mechanism exists but the
required guarantee is incomplete; **DEFERRED** = deliberately postponed; **NOT IMPLEMENTED** = absent.

| Area / status | Current limit and required next investigation |
| --- | --- |
| Safe Mode — groundwork IMPLEMENTED; enforcement NOT IMPLEMENTED | [Corpus](../tests/unit/safe-mode/corpus.ts), [classifier](../src/lib/safe-mode/classify.ts) and [policy](../src/lib/safe-mode/policy.ts) exist. No authoritative execution coordinator applies that policy across query, multi-query, transaction and Agent routes. Read [Architecture](ARCHITECTURE.md#412-preparatory-safe-mode-components) and [policy details](SAFE_MODE_POLICY.md). UI confirmations, Query Safety and Agent execution profiles are separate mechanisms. |
| Explicit disconnect / Connection Toolbar — PARTIAL backend primitive, toolbar DEFERRED | [Disconnect route](../src/app/api/db/disconnect/route.ts) calls `removeProvider`; [factory](../src/lib/db/factory.ts) catches disconnect failures and can create a provider again on a later request. Cache identity/creation, polling, transaction ownership and SSH teardown need coordinated semantics. Endpoint success does not establish a persistent disconnected state; do not fake one in UI. |
| Editable results — feature IMPLEMENTED, safety review PARTIAL | The maintainer reports primary-key values can be edited. [Inline editing](../src/hooks/use-inline-editing.ts) heuristically chooses `id`/`*_id` and a table name, and generates updates. Parameter binding already exists for supported dialects, but row identity, actual PK/unique metadata, joins/views, composite keys, binding coverage and affected-row guarantees need an end-to-end audit. Do not infer production safety from feature availability. |
| Ctrl/Cmd+Enter — known limitation, fix DEFERRED | [QueryEditor tests](../tests/components/QueryEditor.test.tsx) characterize mount-time handlers retaining null Monaco: the shortcut dispatches the full buffer while the current editor ref resolves a statement/selection. Toolbar and shortcut can differ. Extend characterization before changing semantics; the execution-controls checkpoint did not fix it. |
| Transactions — PARTIAL review | [Transaction API](../src/app/api/db/transaction/route.ts) and [multi-query API](../src/app/api/db/multi-query/route.ts) exist. Shared provider transaction state, ownership and batch/rollback behavior need further review. An upstream ownership change is a candidate, not integrated protection. |
| Railway — custom deployment NOT IMPLEMENTED / readiness audit DEFERRED | [Railway docs](../deploy/railway/README.md) describe an upstream image/template. They are not evidence this custom fork was deployed or validated there. |

Current intended suitability is development, local/self-hosted testing and staging/lab use.
Do not describe the fork as fully production-hardened. [Security](SECURITY.md) documents individual
controls and their limits; their presence does not close the gaps above.

## Active UX backlog

These are accepted directions or investigations, not authorization to implement them in this phase.
The inherited [BACKLOG](BACKLOG.md) remains the detailed defect inventory; it is not this fork's
delivery sequence.

- Explorer table context menu: neutral upstream-like treatment; some actions remain colorful and
  English under pt-BR. This is separate from the completed schema-tools ellipsis menu.
- Restrained purple UI accents in place of blue; editor syntax theme later. Refine the light theme.
- Connection reorder, favorite and duplicate UX, after reviewing upstream behavior.
- Editable-results safety audit and query formatter output refinement.
- Settings only when real settings exist; a future AI Side Panel shell (the inherited Agent rail
  already exists, so this is a UX follow-up, not a claim that Agent is absent).
- Custom public README: English canonical `README.md`, future `README.pt-BR.md` translation.
- Railway readiness and lab deployment, gated as below.

## Immediate next sequence

Update this sequence as checkpoints are approved; do not treat it as permanent scheduling.

1. Review and publish the approved custom branch.
2. Create the Railway lab project.
3. Provision private PostgreSQL.
4. Deploy DB Studio Custom.
5. Seed the Apple Store PostgreSQL fixture.
6. Run the Railway smoke test.
7. Begin self-hosted dogfooding.

Railway provisioning and deployment have not started.

## Local test data

The audited workspace contains ignored `data/Apple.db` and `data/estoque_loja_apple_teste.sqlite`,
alongside the project sample database. They are local fixtures, not tracked repository assets;
future clones must not assume they exist. Their presence was checked without reading user rows.
The row count of either local file was not verified. Do not commit generated/local databases.

The versioned, PostgreSQL-native [Apple Store fixture](../scripts/lab/apple-store/README.md)
now lives in `scripts/lab/apple-store/`, independently of those SQLite files. Version **1.0.0**
uses seed **20260925** for deterministic generation of **2,000 synthetic clients**, **3,500 sales**
and **5,600 sale items**. CPF values are synthetic and mathematically invalid; no real personal
data is included. Intended use is development, lab testing and dogfooding only.

Validation against real **PostgreSQL 17.10** confirmed the schema, constraints, views and indexes,
as well as real transaction rollback after a controlled seed failure. The fixture lives in
schema `apple_store_lab`; the observed default PostgreSQL `search_path` (`"$user", public`)
does not include it. Unqualified table names therefore do not resolve unless the connection/role
search path is configured to include that schema. No decision has been made to change this behavior.

## Documentation map and audit limits

| Canonical home | Scope / reuse decision |
| --- | --- |
| [AGENTS](../AGENTS.md) | Short, tool-independent working rules and reading order. |
| This document | Dated fork state, product direction, active backlog and gaps. |
| [Decisions](DECISIONS.md) | Why accepted choices were made. |
| [Architecture](ARCHITECTURE.md), [Storage](STORAGE.md), [API](API_DOCS.md) | Existing structural/runtime references; Architecture and API were adapted in DOC-UPDATE 1. Reuse these specialized references rather than duplicate them here. |
| [Providers](DATABASE_PROVIDERS.md), [provider index](providers/README.md), [PostgreSQL](providers/postgres.md), [MySQL](providers/mysql.md), [SQLite](providers/sqlite.md) | Inventory, visibility, per-engine behavior and limits. |
| [Editor](editor/README.md), [query optimization](editor/query-optimization.md) | Editor implementation and query-related behavior. |
| [OIDC](OIDC.md), [Security](SECURITY.md) | Auth configuration and control-level security evidence. |
| [Toolchain](TOOLCHAIN.md), [testing guide](../README.md#testing), [CI](../.github/workflows/ci.yml) | Existing validation guides and executable gate definitions. |
| [Upstream strategy](UPSTREAM_STRATEGY.md) | Branch roles, selective integration and contribution policy. |
| [Agent runtime](AGENT.md), [user guide](AGENT_GUIDE.md), [data flow](AGENT_DATA_FLOW.md), [LLM setup](llms/setup.md) | The application's AI Agent, not instructions for repository coding agents. |
| [README](../README.md), [distribution](DISTRIBUTION.md), [Railway](../deploy/railway/README.md), [Helm](HELM_CHART.md) | Public entrypoint and inherited deployment references; upstream artifacts are not custom fork releases. |

Audit findings: no root AGENTS, decision log, current-state document or `.codex` directory existed
before this phase. `CLAUDE.md` mixed shared rules with upstream release guidance; it now points to
canonical context. `.claude/agents` contains upstream loop reviewer/judge definitions, and
`.claude/skills` contains a release workflow; these are optional tool-specific assets, not the
fork's authority or an instruction to run them.

Existing docs are reusable but not uniformly current: ARCHITECTURE's animation-version row,
API_DOCS' version banner, README test totals and TOOLCHAIN adoption-time package/consumer claims
are historical/stale context, not live inventory. Use package metadata, source and CI for exact
versions/checks. Some selective-checkpoint/Safe Mode notes remain Portuguese historical reports;
new canonical context is English. This phase does not rewrite the README, deployment guides or
every inherited report. No full code/security/deployment audit is implied by this context audit.
