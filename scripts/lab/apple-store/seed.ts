import { readFile } from "node:fs/promises";
import { Client } from "pg";
import {
  FIXTURE_ID,
  VERSION,
  SEED,
  SCHEMA,
  TABLES,
  generate,
  isValidCpf,
  logicalHash,
  type Dataset,
  type Row,
  type Table,
} from "./generate";

export class LabError extends Error {}

export function configuration(env: Record<string, string | undefined>, args: string[]) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--validate")) {
    throw new LabError("Usage: bun scripts/lab/apple-store/seed.ts [--validate]. No reset mode exists.");
  }
  const connectionString = env.APPLE_STORE_LAB_DATABASE_URL;
  if (!connectionString) throw new LabError("APPLE_STORE_LAB_DATABASE_URL is required; DATABASE_URL is never used.");
  let url: URL;
  let database: string;
  try {
    url = new URL(connectionString);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new LabError("Invalid lab URL (value withheld).");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !database ||
    database.includes("/") ||
    url.hash
  ) {
    throw new LabError("A PostgreSQL URL with an explicit host and database is required.");
  }
  // pg URL parameters can override the destination. Keep this small, explicit and auditable.
  for (const [key, value] of url.searchParams) {
    if (key !== "sslmode" || !["disable", "require", "verify-ca", "verify-full"].includes(value)) {
      throw new LabError("Only the sslmode URL parameter is supported; destination overrides are forbidden.");
    }
  }
  if (env.APPLE_STORE_LAB_CONFIRM_DATABASE !== database) {
    throw new LabError("APPLE_STORE_LAB_CONFIRM_DATABASE must exactly match the URL database name.");
  }
  return {
    connectionString,
    database,
    host: url.hostname,
    port: url.port || "5432",
    validateOnly: args[0] === "--validate",
  };
}

export function insertBatch(table: Table, rows: Row[]) {
  if (!TABLES.includes(table) || rows.length === 0 || rows.length > 250) throw new LabError("Invalid fixture batch.");
  const columns = Object.keys(rows[0]);
  if (
    columns.some((column) => !/^[a-z_]+$/.test(column)) ||
    rows.some((row) => Object.keys(row).join() !== columns.join())
  ) {
    throw new LabError("Invalid fixture columns.");
  }
  const values = rows.flatMap((row) => columns.map((column) => row[column]));
  const placeholders = rows.map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(",")})`);
  return {
    text: `INSERT INTO "${SCHEMA}"."${table}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES ${placeholders.join(",")}`,
    values,
  };
}

const sqlFile = (name: string) => readFile(new URL(name, import.meta.url), "utf8");

async function validate(client: Client) {
  const marker = await client.query(`SELECT fixture_id, versao, seed FROM ${SCHEMA}.metadata_teste`);
  if (
    marker.rows.length !== 1 ||
    marker.rows[0].fixture_id !== FIXTURE_ID ||
    marker.rows[0].versao !== VERSION ||
    String(marker.rows[0].seed) !== String(SEED)
  ) {
    throw new LabError("Fixture metadata does not match this version/seed.");
  }
  const checks = await client.query<{ check_name: string; violations: string }>(await sqlFile("validate.sql"));
  const failures = checks.rows.filter((row) => Number(row.violations) !== 0);
  if (failures.length) throw new LabError(`Validation failed: ${failures.map((row) => row.check_name).join(", ")}`);
  const cpfs = await client.query<{ cpf_ficticio: string }>(`SELECT cpf_ficticio FROM ${SCHEMA}.clientes`);
  if (cpfs.rows.some((row) => isValidCpf(row.cpf_ficticio))) throw new LabError("A synthetic CPF passed validation.");
  return checks.rows;
}

// The caller owns this dedicated client. No pool or application connection is used.
export async function runFixture(client: Client, database: string, validateOnly: boolean, data: Dataset = generate()) {
  const actual = await client.query<{ database: string }>("SELECT current_database() AS database");
  if (actual.rows[0]?.database !== database)
    throw new LabError("Connected database differs from the explicit confirmation.");
  await client.query(validateOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
  try {
    await client.query(
      "SET LOCAL search_path = pg_catalog; SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout = '30s'; SET LOCAL lock_timeout = '5s'",
    );
    if (!validateOnly) {
      const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(20260925, 1) AS locked");
      if (!lock.rows[0].locked) throw new LabError("Another lab seed is running in this database.");
      const existing = await client.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [SCHEMA]);
      if (existing.rowCount) {
        const metadata = await client.query(
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = 'metadata_teste' AND c.relkind = 'r'",
          [SCHEMA],
        );
        if (metadata.rowCount) {
          // Inspect the marker, but never treat it as permission to delete or overwrite.
          const marker = await client.query(`SELECT fixture_id, versao, seed FROM ${SCHEMA}.metadata_teste LIMIT 2`);
          if (marker.rows.length === 1 && marker.rows[0].fixture_id === FIXTURE_ID) {
            throw new LabError("Fixture already exists. Use --validate; automatic reseed/reset is forbidden.");
          }
        }
        throw new LabError("The lab schema already exists and is not a recognized fixture. Refusing all changes.");
      }
      await client.query(await sqlFile("schema.sql"));
      for (const table of TABLES) {
        for (let i = 0; i < data[table].length; i += 250) {
          // oxlint-disable-next-line no-await-in-loop -- One transaction/client; preserve FK order and bounded batches.
          await client.query(insertBatch(table, data[table].slice(i, i + 250)));
        }
        // Only newly-created identity sequences are changed; schema and sequences roll back together.
        // oxlint-disable-next-line no-await-in-loop -- Initialize each identity after its ordered table inserts.
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT MAX(id) FROM "${SCHEMA}"."${table}"), true)`,
          [`${SCHEMA}.${table}`],
        );
      }
    }
    const checks = await validate(client);
    await client.query("COMMIT");
    return checks;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (import.meta.main) {
  let client: Client | undefined;
  try {
    const config = configuration(process.env, process.argv.slice(2));
    console.log(
      JSON.stringify({
        host: config.host,
        port: config.port,
        database: config.database,
        schema: SCHEMA,
        mode: config.validateOnly ? "validate" : "seed",
      }),
    );
    client = new Client({
      connectionString: config.connectionString,
      connectionTimeoutMillis: 5000,
      application_name: FIXTURE_ID,
    });
    await client.connect();
    const data = generate();
    const checks = await runFixture(client, config.database, config.validateOnly, data);
    console.table(checks);
    console.log(
      config.validateOnly
        ? "Fixture validation passed (read-only)."
        : `Fixture created. Logical generated-data SHA-256: ${logicalHash(data)}`,
    );
  } catch (error) {
    // Driver error text may include credentials, connection details or row contents.
    console.error(
      error instanceof LabError
        ? error.message
        : "PostgreSQL lab operation failed; no successful commit was confirmed. Driver details withheld.",
    );
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
