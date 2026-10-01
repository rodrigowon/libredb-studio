import assert from "node:assert/strict";
import { SQLiteProvider } from "../../../src/lib/db/providers/sql/sqlite";

// oxlint-disable no-await-in-loop -- One handle; preserve fixture dependencies and ordered PRAGMA comparisons.

const tableNames = [
  "normal_table",
  "my table",
  "a.b",
  'quote"name',
  "order",
  "MixedCase",
  "cliente_ação",
  'x" WHERE 0 --',
  "value'); SELECT 1; --",
];

// Fixture DDL quotes raw names independently of the provider's inherited quoter.
const identifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;
const literal = (name: string): string => `'${name.replaceAll("'", "''")}'`;

/** Same real-database scenario in Bun and Node children; the parent owns the disposable path. */
export async function runMetadataHardeningFixture(databasePath: string) {
  const provider = new SQLiteProvider({
    id: "sqlite-metadata-hardening",
    name: "Disposable metadata fixture",
    type: "sqlite",
    database: databasePath,
    createdAt: new Date(),
  });
  const parent = 'Parent "客户.Table';
  const parentKey = 'Key "ID';
  const localKey = 'parent "id';
  const valueColumn = "value text";
  const indexNames = tableNames.map((name, i) => (i === 7 ? 'idx" WHERE 0 --' : `idx ${name}".columns`));

  try {
    await provider.connect();
    const version = (await provider.query("SELECT sqlite_version() AS version")).rows[0].version;
    await provider.query(
      `CREATE TABLE ${identifier(parent)} (${identifier(parentKey)} INTEGER PRIMARY KEY AUTOINCREMENT)`,
    );
    await provider.query(`INSERT INTO ${identifier(parent)} VALUES (1), (2)`);
    // Decoys detect wrong-object lookup rather than merely accepting syntactically valid SQL.
    await provider.query("CREATE TABLE x (decoy INTEGER)");
    await provider.query("INSERT INTO x VALUES (999)");
    await provider.query("CREATE INDEX idx ON x(decoy)");

    for (const [i, name] of tableNames.entries()) {
      await provider.query(
        `CREATE TABLE ${identifier(name)} (id INTEGER PRIMARY KEY, ${identifier(localKey)} INTEGER NOT NULL
          REFERENCES ${identifier(parent)}(${identifier(parentKey)}),
          ${identifier(valueColumn)} TEXT DEFAULT 'seed' UNIQUE)`,
      );
      await provider.query(
        `CREATE ${i % 2 === 0 ? "UNIQUE " : ""}INDEX ${identifier(indexNames[i])}
          ON ${identifier(name)} (${identifier(valueColumn)}, ${identifier(localKey)})`,
      );
      for (let row = 1; row <= i + 1; row++) {
        await provider.query(`INSERT INTO ${identifier(name)} VALUES (?, ?, ?)`, [row, (row % 2) + 1, `value-${row}`]);
      }
    }

    const schema = await provider.getSchema();
    const tableStats = await provider.getTableStats();
    const indexStats = await provider.getIndexStats();
    assert.deepEqual(schema.map((table) => table.name).sort(), [...tableNames, parent, "x"].sort());
    assert.equal(tableStats.length, schema.length);
    assert.equal(indexStats.length, indexNames.length + 1);
    assert.equal(schema.find((table) => table.name === parent)?.rowCount, 2);
    assert.equal(schema.find((table) => table.name === "x")?.rowCount, 1);
    assert.deepEqual(indexStats.find((index) => index.indexName === "idx")?.columns, ["decoy"]);

    for (const [i, name] of tableNames.entries()) {
      const table = schema.find((item) => item.name === name);
      assert.ok(table, `Missing table ${name}`);
      assert.equal("ref" in table, false);
      assert.equal(table.rowCount, i + 1);
      assert.equal(tableStats.find((item) => item.tableName === name)?.rowCount, i + 1);
      assert.deepEqual(table.columns, [
        { name: "id", type: "INTEGER", nullable: true, isPrimary: true, defaultValue: undefined },
        { name: localKey, type: "INTEGER", nullable: false, isPrimary: false, defaultValue: undefined },
        { name: valueColumn, type: "TEXT", nullable: true, isPrimary: false, defaultValue: "'seed'" },
      ]);
      assert.deepEqual(table.foreignKeys, [
        { columnName: localKey, referencedTable: parent, referencedColumn: parentKey },
      ]);
      assert.deepEqual(table.indexes, [{ name: indexNames[i], columns: [valueColumn, localKey], unique: i % 2 === 0 }]);
      const index = indexStats.find((item) => item.indexName === indexNames[i]);
      assert.ok(index, `Missing index ${indexNames[i]}`);
      assert.equal(index.tableName, name);
      assert.deepEqual(index.columns, [valueColumn, localKey]);
      assert.equal(index.isUnique, i % 2 === 0);
      assert.equal(index.isPrimary, false);

      // Compare shape AND row order with safely quoted legacy PRAGMAs on each real driver.
      for (const [pragma, argument] of [
        ["table_info", name],
        ["foreign_key_list", name],
        ["index_list", name],
        ["index_info", indexNames[i]],
      ]) {
        const legacy = await provider.query(`PRAGMA ${pragma}(${literal(argument)})`);
        const bound = await provider.query(`SELECT * FROM pragma_${pragma}(?)`, [argument]);
        assert.deepEqual(bound.rows, legacy.rows);
        assert.deepEqual(bound.fields, legacy.fields);
      }
    }

    return { version, tables: tableNames.length, indexes: indexNames.length, schemaTables: schema.length };
  } finally {
    await provider.disconnect();
    assert.equal(provider.isConnected(), false);
  }
}

// Both children exit naturally; only the parent removes the database after exit.
if (import.meta.main || typeof Bun === "undefined") {
  const databasePath = process.argv[2];
  assert.ok(databasePath, "The parent must supply a disposable SQLite path");
  runMetadataHardeningFixture(databasePath).then(
    (report) => console.log(JSON.stringify(report)),
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
