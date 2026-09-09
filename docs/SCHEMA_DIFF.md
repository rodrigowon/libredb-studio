# Generated migration SQL — selective upstream checkpoint 1

This fork adopts the generator/index-comparison corrections from upstream commit
`777caf095066cc8d978a7869032ca69063165db7` without merging other upstream changes.
The affected implementation and existing unit tests matched that commit's parent,
so no additional prerequisite commits or dependencies were required.

`generateMigrationSQL` produces a reviewable SQL string, not an execution plan.
Schema Diff only displays it; this checkpoint adds no Apply button, execution
endpoint, migration runner or automatic execution. The translated component,
SchemaDiff catalogs, English fallback and deep merge remain unchanged. SQL and
technical comments inside the artifact remain in English, as upstream intended.

## Dialect behavior

- PostgreSQL retains identifier quoting, types and BEGIN/COMMIT. Removed foreign
  keys and removed/replaced indexes now precede dependent column changes.
- MySQL retains backtick quoting, MODIFY COLUMN, DROP FOREIGN KEY and DROP INDEX
  ... ON table. Its existing BEGIN/COMMIT wrapper is preserved; it is not a
  guarantee of atomic DDL or rollback because MySQL DDL can commit implicitly.
- SQLite retains explicit refusal comments for column alteration/removal and
  foreign-key changes requiring table recreation. It does not acquire a table
  rebuild implementation or a transaction wrapper. Modified indexes are replaced.
- SQL Server uses BEGIN TRANSACTION, ADD without COLUMN and DROP INDEX ... ON table.
- Oracle emits no transaction wrapper, uses ADD (...), DEFAULT before NOT NULL,
  and unconditional DROP TABLE/INDEX/CONSTRAINT forms without IF EXISTS.
- MongoDB, Redis, LibreDB, Couchbase, Druid, Elasticsearch and OpenSearch receive
  explanatory comments instead of relational table DDL. ClickHouse and Trino
  decline unsupported index/FK clauses; Trino also declines primary keys.
- Existing Cassandra, libSQL and DuckDB limitations remain explicit. All providers,
  contracts, dependencies and the postgres/mysql/sqlite visibility default remain intact.

## Indexes, ordering and metadata

Composite index column order matters. Array serialization distinguishes both
reordered columns and names containing commas without mutating the input schemas.
Changing columns or uniqueness drops the old index before column changes and
recreates its target definition afterwards. Removed FKs precede index removal.
Unique index creation can still fail on existing duplicate data.

Object metadata is not trusted: CR, LF, U+2028 and U+2029 are flattened only when
interpolated into generated comments. SQL identifiers retain their names and use
the existing delimiter-escaping quoter. Index and derived constraint names occur
in quoted DDL, not informational comments. Default expressions and types remain
SQL fragments from introspection; this is not a general SQL sanitization layer.

Review the SQL before any manual execution. The diff still lacks original FK
constraint names, schema qualifiers, cross-table dependency ordering and a
general type-conversion strategy. It is not an idempotent migration script.

## Regression coverage

The unit suites under `tests/unit/schema-diff` cover dialect DDL, index order and
replacement, dependency ordering, unsupported dialects and newline metadata.
SQLite regressions explicitly execute generated SQL only in disposable in-memory
test databases. Component tests preserve en/pt-BR chrome and verify that showing
the SQL neither changes its text nor submits a network request. Existing i18n
tests cover catalogs and fallback/deep merge.

The upstream opt-in `tests/live/schema-diff-dialects.ts` is deliberately not copied:
it provisions/removes Oracle schemas and SQL Server databases and is outside this
V1-focused checkpoint. No live Oracle, SQL Server, PostgreSQL or MySQL server
validation is claimed here. Upstream's live measurements are not measurements of
this fork's environment.

Checkpoint validation (2026-09-09): `bun run typecheck`, `bun run lint`,
`bun run build` and `git diff --check` passed. The Schema Diff unit suites plus
`tests/unit/i18n/load-messages.test.ts` passed 228 tests; the isolated
`tests/components/SchemaDiff.test.tsx` passed 73 (301 total, zero failures).
Existing lint warnings and build warnings about dynamic filesystem tracing and
an external package-lock remain outside this checkpoint's scope.
