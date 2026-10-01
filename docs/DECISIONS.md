# Fork decisions

Accepted product decisions recorded on 2026-09-25. An accepted decision is not proof that all
implementation work is complete. [Current state](CURRENT_STATE.md) owns rollout status and open gaps;
specialized documents own technical details. Update a record explicitly when a decision changes.

## ADR-001 — Visible database engines

- **Status:** Accepted.
- **Decision:** Offer PostgreSQL, MySQL and SQLite by default through the central
  [visibility layer](DATABASE_PROVIDERS.md#provider-visibility-in-this-fork).
- **Rationale:** Focus V1 without creating unnecessary divergence from the shipped provider system.
- **Consequences:** Hidden providers, dependencies and saved connections remain. Visibility is not authorization.

## ADR-002 — The browser is untrusted

- **Status:** Accepted.
- **Decision:** Make security decisions on the server from authenticated, authoritative context.
- **Rationale:** Browser payloads, state and controls can be changed or bypassed.
- **Consequences:** UI restrictions and user/model/database content are not trusted authorization evidence.
  See the [security control reference](SECURITY.md).

## ADR-003 — Safe Mode cannot rely on UI controls

- **Status:** Accepted; enforcement rollout incomplete.
- **Decision:** Production protection must not be enabled, disabled or bypassed through browser-only state.
- **Rationale:** A classifier and pure policy can describe requirements but cannot enforce execution alone.
- **Consequences:** A future authoritative execution boundary is required; existing confirmations and
  Agent profiles must not be relabeled as complete Safe Mode. [Current gap](CURRENT_STATE.md#incomplete-and-unsafe-areas).

## ADR-004 — Explicit disconnect is deferred

- **Status:** Accepted deferral.
- **Decision:** Do not expose a disconnected state the backend cannot reliably guarantee.
- **Rationale:** Removing a cached provider does not coordinate recreation, polling, transactions and SSH.
- **Consequences:** Connection Toolbar remains deferred pending a scoped lifecycle design and validation;
  a local UI boolean is not an acceptable substitute.

## ADR-005 — English-first product

- **Status:** Accepted direction; runtime default migration pending.
- **Decision:** English is the primary product language; pt-BR is secondary, with future languages possible.
- **Rationale:** Make the product and its canonical technical context usable beyond the original workflow.
- **Consequences:** Keep centralized keys and both catalogs. Do not confuse direction with the
  [currently implemented locale resolution](ARCHITECTURE.md#410-localization). Canonical technical docs
  are English; a custom public README and its Portuguese version are a separate checkpoint.

## ADR-006 — Selective upstream integration

- **Status:** Accepted.
- **Decision:** Review individual upstream changes; do not merge the upstream branch wholesale into custom.
- **Rationale:** Intentional product UX, localization and safety boundaries differ from upstream.
- **Consequences:** Use the [integration procedure](UPSTREAM_STRATEGY.md); manual adaptation is often
  appropriate and any cherry-pick needs explicit authorization and dependency review.

## ADR-007 — Open-source-first strategy

- **Status:** Accepted.
- **Decision:** Open-source/self-hosted now; discreet voluntary support is allowed. Monetization is not current scope.
- **Rationale:** Mature the product through use and feedback before introducing commercial complexity.
- **Consequences:** No billing/paywall/Free-Pro architecture now. Keep future hosting/commercial options
  possible without treating a speculative SaaS roadmap as decided. [Product direction](CURRENT_STATE.md#product-direction).

## ADR-008 — Focused product scope

- **Status:** Accepted.
- **Decision:** Be simple on the surface and professional in depth; do not rebuild DataGrip.
- **Rationale:** Opening, understanding and working with a database is the primary job.
- **Consequences:** Evaluate features against that job; preserve advanced depth without expanding the
  default interface merely because upstream offers a feature.

## ADR-009 — React Flow attribution

- **Status:** Accepted.
- **Decision:** Keep attribution unless removal is legitimately supported and the applicable basis is verified.
- **Rationale:** No removal entitlement was established in this fork's review.
- **Consequences:** Existing attribution remains. Revisit only with evidence and an explicit scoped decision;
  this is a project choice, not a claim that visible attribution is universally mandated by the license.

## ADR-010 — Production safety claims

- **Status:** Accepted.
- **Decision:** Do not describe the fork as fully production-hardened while execution/lifecycle gaps remain.
- **Rationale:** Individual tested controls are not an end-to-end safety guarantee.
- **Consequences:** Document suitability and limits explicitly in [Current state](CURRENT_STATE.md#incomplete-and-unsafe-areas);
  close and validate the relevant gaps before changing that claim.

## ADR-011 — Editable Results containment

- **Status:** Accepted on 2026-09-30; temporary containment implemented, hardening pending.
- **Decision:** Editable Results remains disabled in the primary Studio until data-integrity
  guarantees are hardened.
- **Rationale:** The existing visual editing flow can select the wrong physical row/table under
  documented scenarios, so visual mutation is suspended while normal SQL execution remains available.
- **Consequences:** This is temporary containment, not feature removal or a read-only product.
  Preserve the internal implementation; do not re-enable only by restoring the toolbar toggle.
  Reactivation requires dedicated safety design and the
  [hardening work](CURRENT_STATE.md#editable-results-containment-and-hardening).

## ADR-012 — Explorer relation identity foundation

- **Status:** Accepted on 2026-09-30; foundation implemented, runtime migration pending.
- **Decision:** Represent relation identity as structured namespace + name, with object kind
  separate from identity. Preserve legacy `TableSchema.name` and make `TableSchema.ref` optional.
  Explicit, structurally valid refs are authoritative; ambiguous legacy names are not parsed
  to reconstruct namespaces. A null namespace means explicit absence, not search_path inference.
- **Rationale:** Existing names conflate display, identity and SQL targeting. Parsing qualified
  names loses correctness for literal dots and quoted names. An additive migration avoids
  breaking ERD, Schema Diff, snapshots and embedded hosts.
- **Consequences:** New structured paths can adopt `RelationRef` incrementally; legacy consumers
  remain unchanged until separately migrated. Providers do not populate ref yet and the
  helpers have no runtime consumers. [Rollout state](CURRENT_STATE.md#explorer-v1-identity-foundation).

## ADR-013 — Schema metadata uses latest-generation-wins ownership

- **Status:** Accepted on 2026-10-01; implemented in standalone and embedded schema controllers.
- **Decision:** Each schema-loading controller owns a monotonically increasing local request
  generation. Every load receives a generation; only the current generation may mutate
  schema-loading state. Post-list relations enrichment belongs to the generation of its list.
- **Rationale:** Connection ID alone cannot distinguish overlapping refreshes or a connection
  replaced with the same ID. Older lists/enrichment may finish after newer loads, and stale
  error/finally paths can corrupt current error/loading state.
- **Consequences:** Obsolete requests may finish but become state-inert; correctness does not
  depend on `AbortController`. Provider cache identity remains a separate concern. Embedded
  same-ID host changes still need an actual new load invocation to advance request ownership.
  No generalized async-task framework is introduced.
  [Rollout and embedded limit](CURRENT_STATE.md#schema-metadata-generation-protection).
