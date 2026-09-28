# Apple Store PostgreSQL lab fixture

An optional, standalone dataset for Explorer, joins, views, ERD, EXPLAIN and SQL
experiments. This is **not affiliated with, endorsed by, or an official catalog of
Apple**. Product names are illustrative; prices, people, contacts and transactions
are synthetic. Nothing is loaded automatically by Studio or its startup scripts.
This fixture does not make the application production-safe.

## Layout and requirements

- [generate.ts](generate.ts): pure deterministic data generation and logical hash.
- [schema.sql](schema.sql): PostgreSQL-native tables, constraints, indexes and views.
- [seed.ts](seed.ts): guarded connection, bounded inserts, transaction and validation.
- [validate.sql](validate.sql): read-only relational checks; all violations must be zero.
- [smoke.sql](smoke.sql): ten exploratory queries plus plain EXPLAIN.
- [Unit tests](../../../tests/unit/lab/apple-store.test.ts): generation and runner guards.

Use the repository's installed Bun toolchain and existing `pg` dependency. No new
packages, extensions, SQLite file, application process or administrative database
provisioning are required by the fixture. The target is **PostgreSQL 17**. Other
versions are not certified by this fixture. The SQL uses standard PostgreSQL
identity columns and built-in features only.

This directory is separate from runtime `seed-assets`, existing Docker development
database initialization, and small test doubles in `tests/fixtures`. It is not
imported by application or library code and does not change package scripts or CI.

## Explicit destination and execution

Provision a **new, disposable lab database** separately. Never use a production,
shared, or existing project database. The role needs CONNECT to that database and
CREATE on the database to create the dedicated schema; it need not be a superuser.
The script never creates or changes roles or databases.

Set these variables in your current shell, not in committed files:

| Variable | Meaning |
| --- | --- |
| `APPLE_STORE_LAB_DATABASE_URL` | Approved PostgreSQL URL with an explicit host and database |
| `APPLE_STORE_LAB_CONFIRM_DATABASE` | Exact decoded database name from that URL, confirmed separately |

The database name is not fixed. For example, a separately provisioned database may
be named `apple_store_lab`. The schema **is always `apple_store_lab`**. Check host,
port and database before running; typing a matching confirmation is an accident
guard, not proof that the destination is disposable.

PowerShell template (replace both placeholders before running):

```powershell
$env:APPLE_STORE_LAB_DATABASE_URL = '<approved-lab-postgresql-url>'
$env:APPLE_STORE_LAB_CONFIRM_DATABASE = '<exact-lab-database-name>'
bun scripts/lab/apple-store/seed.ts
bun scripts/lab/apple-store/seed.ts --validate
```

Run these commands from the repository root. SQL files are resolved relative to
the script, not the working directory. Do not invoke `schema.sql` directly as a
substitute for the runner: that bypasses the destination checks and transaction.
No fallback to `DATABASE_URL` exists. Connection URLs are not printed. The runner
prints the resolved host, port, database, fixed schema and operation mode only.
Raw driver error details are withheld to avoid leaking credentials or row data.

URL query parameters are restricted to `sslmode=disable|require|verify-ca|verify-full`;
host/database overrides and unknown parameters are rejected. Choose verified TLS
and the appropriate trusted CA for any future remote lab; this fixture does not
provision TLS or configure Railway. Never weaken production TLS to run it.

## Write boundaries, repeat runs and failure behavior

Before DDL/DML the runner checks `current_database()` against the explicit
confirmation. It then takes a transaction-scoped advisory lock and checks for the
fixed schema and its fixture metadata. Any existing schema is refused, including
an empty schema, an unknown schema, or a recognized older/current fixture. The
metadata marker is **not** permission to overwrite objects.

**There is no reset mode in Phase 1.** `--reset` and unknown arguments are rejected
before connection. A repeat seed exits nonzero without changing the fixture.
Use `--validate` to check an existing installation. To reproduce from scratch,
provision another empty disposable database or replace your separately managed
disposable lab container after verifying its ownership. This script never issues
DROP, TRUNCATE, or deletion of an existing schema/table/database.

Schema, data and identity-sequence initialization are one transaction. Inserts
use batches of at most 250 rows, with every value parameterized. Validation runs
before COMMIT; a statement or validation failure rolls back the new schema and
data. Session-local statement and lock timeouts are bounded. A network failure at
COMMIT can leave the outcome unknown: inspect with `--validate` rather than assume
that a failed client message proves rollback.

`--validate` uses a repeatable-read, read-only transaction and does not reseed,
update sequences or repair data. It checks the version/seed marker, relational
invariants and CPF invalidity. It is a baseline integrity check, not an immutable
content checksum: legitimate exploratory changes may make some checks fail, and
not every possible content edit is detected. The printed SHA-256 on creation is
the **generated logical dataset hash**, not a live database dump hash.

## Versioned data contract

- Fixture ID: `libredb-apple-store-lab`.
- Version: `1.0.0`; seed: `20260925`; logical metadata date: `2026-09-25`.
- PRNG: Mulberry32 using fixed-width unsigned integer operations.
- Sales span 24 calendar months in 2024–2025; timestamps are explicit UTC.
- No wall-clock timestamps, random UUIDs, locale sorting or unseeded randomness.
- The CLI uses the versioned seed, not an environment override. The generator
  accepts other uint32 seeds for unit tests; SQL validation targets the baseline.
- Logical SHA-256: `8b4160886b6ea0929bc4f867cf2e8ee36d8ef96435eb4813e8461260e399c6a5`.

| Table | Rows |
| --- | ---: |
| categorias | 7 |
| produtos | 36 |
| estoque | 36 |
| fornecedores | 6 |
| entradas_estoque | 250 |
| clientes | 2,000 |
| funcionarios | 12 |
| vendas | 3,500 |
| itens_venda | 5,600 |
| movimentacoes_estoque | 5,572 |
| metadata_teste | 1 |

The seven product families are iPhone, Mac, iPad, Apple Watch, AirPods, Displays
and accessories. Some products and customers are inactive. There are 16 cities
across 15 Brazilian states/federal district, clients without purchases, five
employee roles, three channels and five payment methods.

Names and Portuguese identifiers are intentional. Names carry a `Teste` marker;
addresses are fictional streets/neighborhoods. Emails use the reserved
`example.test` domain. Telephone and postal fields use non-contactable `TEL-LAB-`
and `CEP-LAB-` markers, **not plausible routable telephone numbers or postal codes**.
Supplier identifiers and invoices are explicitly fictitious.

Every `cpf_ficticio` has CPF-like display formatting and a unique base, but its
check digits deliberately fail mathematical CPF validation. Both generation and
unit tests verify this, with an independent checksum implementation in the tests.
No generated identifier should be submitted to an identity/credit service.

## Relational and monetary model

All 11 primary keys use `INTEGER GENERATED BY DEFAULT AS IDENTITY`. Seeded IDs
are explicit and stable; each newly created sequence is advanced to the maximum
seed ID so later test inserts work normally. Foreign keys use `RESTRICT` for both
updates and deletes: no accidental cascading removal of sales or stock history.
Booleans use BOOLEAN, birthdays/logical dates use DATE, event times use TIMESTAMPTZ,
and money uses NUMERIC(12,2). No floating-point money is stored or summed: the
generator calculates in integer cents, then binds two-decimal strings.

Each sale has 1–4 distinct products. Item subtotal is unit price × quantity minus
item discount; sale total is the sum of subtotals minus the sale-level discount.
There are 3,150 completed, 175 pending and 175 cancelled sales. Only completed
sales generate stock exits (5,250 linked movements). Every supplier entry has a
matching positive movement (250). The other 72 movements are explicit synthetic
opening and final-stocktake adjustments, not hidden independent stock snapshots.

Stock equals the sum of signed movements per product. Opening balances are
calculated to prevent negative historical balances; final stocktakes deliberately
yield nine zero-stock products, nine low-stock products, and eighteen regular/
high-stock products. A sale can be recorded with an inactive product because
`ativo` represents the final catalog snapshot, not an event-time eligibility rule.
This is not an inventory application: exploratory writes do not automatically
recalculate stock or sale totals; no business-maintenance triggers are installed.

Fourteen explicit secondary indexes support category/name lookup, client
name/location/birthday, sales by client/staff/date/status, product item/entry
lookups, supplier entries and movement timelines. PK/UNIQUE constraints add their
own indexes. The unique `(venda_id, produto_id)` index covers sale item lookups
without another redundant single-column index.

- `produtos_com_estoque`: joined catalog and stock, with `SEM ESTOQUE`,
  `ESTOQUE BAIXO` and `OK` labels.
- `resumo_vendas`: sale, client/location, staff, channel/payment/status, total,
  distinct item count and units. All statuses remain visible; revenue smoke
  queries explicitly select completed sales to avoid overstating revenue.

## Validation

```sh
bun test tests/unit/lab/apple-store.test.ts
bun run typecheck
bunx --no-install oxlint scripts/lab/apple-store tests/unit/lab/apple-store.test.ts
bunx --no-install eslint scripts/lab/apple-store tests/unit/lab/apple-store.test.ts
git diff --check
```

Against an explicitly approved disposable PostgreSQL 17 destination, run seed,
then `--validate`, then [smoke.sql](smoke.sql) in a PostgreSQL client connected to
that same database. The SQL files fully qualify their objects. Validation must
return zero violations for every check. Smoke queries cover top clients/products,
state/month revenue, low/zero stock, clients without completed purchases, average
ticket, channels and statuses. Plain EXPLAIN is included, not EXPLAIN ANALYZE.

Verify a second seed is refused and that counts remain unchanged. Delete only the
dedicated disposable container you created for the check, never existing services.
The unit query double verifies transaction control and refusals; it does **not**
prove SQL compatibility, constraints, planner behavior or real rollback. Those
require PostgreSQL validation. A full Next.js build is unnecessary for these
isolated files, which are not imported by the application.
