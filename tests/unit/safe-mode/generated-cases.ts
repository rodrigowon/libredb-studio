import { defaultColumns, generateCreateTableSQL } from "@/lib/create-table";
import { generateMigrationSQL } from "@/lib/schema-diff/migration-generator";
import type { SchemaDiff } from "@/lib/schema-diff/types";
import { DIALECTS, expectation, statement as s, type SqlCase } from "./model";

const added: SchemaDiff = {
  hasChanges: true,
  summary: { added: 1, removed: 0, modified: 0 },
  tables: [
    {
      tableName: "new_items",
      action: "added",
      columns: [{ action: "added", columnName: "id", targetType: "INTEGER", changes: [] }],
      indexes: [{ action: "added", indexName: "idx_new_items", targetColumns: ["id"], changes: [] }],
      foreignKeys: [],
    },
  ],
};
const modified: SchemaDiff = {
  hasChanges: true,
  summary: { added: 0, removed: 0, modified: 1 },
  tables: [
    {
      tableName: "items",
      action: "modified",
      columns: [
        { action: "removed", columnName: "old", changes: [] },
        { action: "added", columnName: "replacement", targetType: "INTEGER", changes: [] },
      ],
      indexes: [
        { action: "modified", indexName: "idx_items", targetColumns: ["replacement"], targetUnique: true, changes: [] },
      ],
      foreignKeys: [{ action: "removed", columnName: "old", changes: [] }],
    },
  ],
};

/** Normalize ONLY the generator's volatile timestamp comment for reproducible evidence. */
function migration(diff: SchemaDiff, dialect: (typeof DIALECTS)[number]): string {
  return generateMigrationSQL(diff, dialect).replace(
    /^-- Migration generated at [^\r\n]*/,
    "-- Migration generated at 2026-09-11T00:00:00.000Z",
  );
}

/** SQL is produced by the actual fork generators on every run, not copied from examples. */
export const generatedCases: SqlCase[] = DIALECTS.flatMap((dialect) => {
  const schema = (operation: string) => s("schema", operation);
  const wrap = (items: ReturnType<typeof s>[]) =>
    dialect === "sqlite" ? items : [s("transaction", "begin"), ...items, s("transaction", "commit")];
  return [
    {
      id: `${dialect}/generated-create-table`,
      dialect,
      sql: generateCreateTableSQL("widgets", defaultColumns(dialect), dialect),
      source: "create-table",
      syntax: "valid",
      purpose: "Actual dialect-specific identity/AUTO_INCREMENT/AUTOINCREMENT output",
      expected: expectation([schema("create-table")]),
    },
    {
      id: `${dialect}/generated-migration-create`,
      dialect,
      sql: migration(added, dialect),
      source: "schema-diff",
      syntax: "valid",
      purpose: "Actual CREATE TABLE/CREATE INDEX migration with dialect transaction wrapper",
      expected: expectation(wrap([schema("create-table"), schema("create-index")])),
    },
    {
      id: `${dialect}/generated-migration-alter`,
      dialect,
      sql: migration(modified, dialect),
      source: "schema-diff",
      syntax: "valid",
      purpose:
        "Actual DROP FK/index, ADD/DROP COLUMN, CREATE INDEX batch; SQLite unsupported FK/drop-column are comments only",
      expected: expectation(
        wrap(
          dialect === "sqlite"
            ? [schema("drop-index"), schema("alter-table"), schema("create-index")]
            : [
                schema("alter-table"),
                schema("drop-index"),
                schema("alter-table"),
                schema("alter-table"),
                schema("create-index"),
              ],
        ),
      ),
    },
  ];
});
