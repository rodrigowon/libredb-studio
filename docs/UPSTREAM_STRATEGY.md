# Upstream strategy

## Repository and branch roles

- `origin`: `https://github.com/rodrigowon/libredb-studio.git`, the custom fork.
- `upstream`: `https://github.com/libredb/libredb-studio.git`, the original project.
- `main`: upstream baseline branch; its latest observed alignment is in the
  [Git snapshot](CURRENT_STATE.md#git-snapshot), not a guarantee of continuous synchronization.
- `feat/dbstudio-custom`: the custom product. Updating `main` does not authorize integrating it here.

Verify actual remotes, refs and working-tree state before any operation. Fetch only within the
authorized task and report which observations come from local refs. Do not freeze commit counts as
permanent facts. The inherited package name, registry images and marketplace templates refer to
upstream distribution; they do not publish this fork or select its custom source.

## Integration procedure

1. Establish the custom HEAD and merge-base, then inspect the specific candidate's diff, tests,
   prerequisites and current upstream implementation.
2. Classify it as a relevant bug/security fix, compatible improvement, intentional fork divergence,
   architectural change requiring a separate design, or not currently relevant.
3. Prefer the smallest coherent change. Adapt manually when surrounding architecture diverged.
   A cherry-pick is only appropriate when dependency and conflict review establishes low risk and
   the task explicitly authorizes it. Never merge hundreds of upstream commits blindly.
4. Preserve deliberate custom UX, localization, visibility, safety semantics and provider contracts.
   A refactor or dependency upgrade is not implicitly authorized by a bug-fix integration.
5. Validate with affected tests and the [project validation rules](../AGENTS.md#validation), including
   standalone/embedded surfaces where shared code changes. Keep adaptations reviewable in small checkpoints.

When separately authorized to synchronize `main`, first establish clean tracked state and ancestry.
Use fast-forward only if safe; divergence requires reporting, not reset/rebase/force-push.
Do not integrate `main` into custom as a side effect. Local work does not authorize publishing or a PR.

## Reviewed evidence and candidates

Observed against local `upstream/main` on **2026-09-25**. These observations are bounded to that
snapshot and do not claim a new live upstream audit or authorize integration.

| Change | Evidence / disposition |
| --- | --- |
| Dialect-aware Schema Diff | Adapted in the fork; source and limits recorded in [SCHEMA_DIFF](SCHEMA_DIFF.md). |
| Dialect-aware Create Table | Adapted; see [CREATE_TABLE_DIALECTS](CREATE_TABLE_DIALECTS.md). |
| PostgreSQL Agent grounding | Adapted composer/consumer contract; see [AGENT_GROUNDING_CAPTURE](AGENT_GROUNDING_CAPTURE.md). |
| Server-side EXPLAIN | Adapted with deliberate estimate/analyze semantics; see [EXPLAIN_SERVER_SIDE](EXPLAIN_SERVER_SIDE.md). |
| Provider cache isolation | Upstream `b870e5ff4958a22500ab81aa638efb86c12a2e98` stops keying the cache solely on caller-supplied connection id and adds `provider-cache-key.ts`. Valuable review candidate, not integrated: the custom factory still uses `connection.id`. |
| Transaction ownership | Upstream `83d606eb` adds `src/lib/api/transaction-ownership.ts` and route coordination. Its identity is the authenticated account, not a per-tab guarantee. Candidate only; the custom transaction route does not have this ownership layer. |
| New object tree | Upstream `acf50738` introduces containers/kinds and a lazy object tree across engines. High integration risk because it spans provider contracts and Explorer UI; not a drop-in sidebar change. |
| Explicit disconnect | The upstream route still delegates to provider removal; no reliable end-to-end explicit-disconnect state was established by the review. Cache/ownership improvements alone are not proof of lifecycle correctness. Reassess creation, polling, transactions and SSH together before exposing controls. |

The selective-checkpoint documents hold adaptation details; this file owns the procedure and
candidate disposition. Recheck candidates before implementation because both branches evolve.

## Future contributions and inherited workflows

Once the custom behavior is stable, extract generally useful improvements into small independent
upstream PRs. Generic bug fixes, security corrections and dialect improvements are stronger
candidates than a PR containing the whole custom branch. Keep fork-specific branding/UX local
unless independently useful and explicitly proposed. Opening a PR always needs task authorization.

Upstream release automation and `.claude` assets describe upstream workflows, not fork permissions,
branch protection or a promise of published packages. Before any separately authorized release,
inspect the actual workflows and [distribution reference](DISTRIBUTION.md). Upstream uses bare
semver product tags and `libredb-studio-<chart version>` chart tags; old `v` tags are historical.
Package/chart/operator version gates live in [CI](../.github/workflows/ci.yml),
[chart synchronization](../scripts/sync-chart-version.mjs) and the [operator](../operator/).
Do not infer a release procedure from sorting tag names or treating a tool-specific skill as
authorization to publish. Nothing in this strategy requests a release or a new integration.
