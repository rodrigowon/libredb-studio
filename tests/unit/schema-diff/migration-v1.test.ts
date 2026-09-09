import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { generateMigrationSQL } from "@/lib/schema-diff/migration-generator";
import type { SchemaDiff, TableDiff } from "@/lib/schema-diff/types";
import { quoteIdentifier } from "@/lib/sql/identifier";

function diff(table: Partial<TableDiff>): SchemaDiff {
  return {
    hasChanges: true,
    summary: { added: 0, removed: 0, modified: 1 },
    tables: [{ tableName: "items", action: "modified", columns: [], indexes: [], foreignKeys: [], ...table }],
  };
}

describe("V1 migration regressions", () => {
  for (const dialect of ["postgres", "mysql", "sqlite"] as const) {
    test(`${dialect}: dependency removal precedes column changes and replacement indexes`, () => {
      const sql = generateMigrationSQL(diff({
        columns: [
          { action: "removed", columnName: "old", changes: [] },
          { action: "added", columnName: "replacement", targetType: "integer", changes: [] },
        ],
        indexes: [{ action: "modified", indexName: "idx", targetColumns: ["replacement"], targetUnique: true, changes: [] }],
        foreignKeys: [{ action: "removed", columnName: "old", changes: [] }],
      }), dialect);
      const foreignKey = dialect === "mysql" ? "DROP FOREIGN KEY" : dialect === "sqlite" ? "Cannot drop foreign key" : "DROP CONSTRAINT";
      const column = dialect === "sqlite" ? "Cannot drop column" : "DROP COLUMN";
      for (const fragment of [foreignKey, "DROP INDEX", column, "CREATE UNIQUE INDEX"]) expect(sql).toContain(fragment);
      expect(sql.indexOf(foreignKey)).toBeLessThan(sql.indexOf("DROP INDEX"));
      expect(sql.indexOf("DROP INDEX")).toBeLessThan(sql.indexOf("ADD COLUMN"));
      expect(sql.indexOf("DROP INDEX")).toBeLessThan(sql.indexOf(column));
      expect(sql.indexOf(column)).toBeLessThan(sql.indexOf("CREATE UNIQUE INDEX"));
      if (dialect === "sqlite") {
        expect(sql).not.toMatch(/^(BEGIN|COMMIT|ALTER TABLE .* DROP)/m);
      } else {
        expect(sql).toMatch(/^BEGIN;$/m);
        expect(sql).toMatch(/^COMMIT;$/m);
      }
    });

    for (const separator of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
      test(`${dialect}: table comment flattens ${JSON.stringify(separator)}`, () => {
        const name = `hostile${separator}DELETE FROM sentinel;${separator}--`;
        const sql = generateMigrationSQL(diff({ tableName: name }), dialect);
        expect(sql).toContain(`-- Alter table: ${name.replace(/[\r\n\u2028\u2029]/g, " ")}`);
        expect(sql).not.toContain(name);
        expect(sql).not.toMatch(/^DELETE FROM sentinel;/m);
      });
    }
  }

  for (const action of ["removed", "modified"] as const) {
    test(`SQLite: ${action} column and FK refusals cannot escape comments`, () => {
      const name = 'x"\r\nDELETE FROM sentinel;\u2028DELETE FROM sentinel;\u2029--';
      const sql = generateMigrationSQL(diff({
        columns: [{ action, columnName: name, targetType: "integer", changes: [] }],
        foreignKeys: [{ action: "added", columnName: name, changes: [] }],
      }), "sqlite");
      expect(sql).toContain("Requires table recreation");
      expect(sql).not.toMatch(/[\r\u2028\u2029]/);
      expect(sql.split("\n").filter((line) => line.trim() && !line.startsWith("--"))).toEqual([]);
    });
  }

  for (const dialect of ["postgres", "mysql"] as const) {
    test(`${dialect}: hostile index and derived FK constraint names use escaped identifiers`, () => {
      const name = 'x"`\r\nDELETE FROM sentinel;\n--';
      const q = (value: string) => quoteIdentifier(value, dialect);
      const sql = generateMigrationSQL(diff({
        tableName: name,
        indexes: [{ action: "added", indexName: name, targetColumns: [name], changes: [] }],
        foreignKeys: [{ action: "added", columnName: name, targetReferencedTable: name, targetReferencedColumn: name, changes: [] }],
      }), dialect);
      expect(sql).toContain(`CREATE INDEX ${q(name)} ON ${q(name)} (${q(name)});`);
      expect(sql).toContain(`ADD CONSTRAINT ${q(`fk_${name}_${name}`)} FOREIGN KEY (${q(name)}) REFERENCES ${q(name)}(${q(name)});`);
      expect(sql).toContain(`-- Alter table: ${name.replace(/[\r\n\u2028\u2029]/g, " ")}`);
    });
  }

  test("SQLite: hostile table, column, index and FK names remain identifiers", () => {
    const name = 'x"\r\nDELETE FROM sentinel;\n--';
    const indexName = `idx_${name}`;
    const q = (value: string) => quoteIdentifier(value, "sqlite");
    const db = new Database(":memory:");
    try {
      db.exec("PRAGMA foreign_keys = ON; CREATE TABLE sentinel (id INTEGER PRIMARY KEY); INSERT INTO sentinel VALUES (1);");
      const sql = generateMigrationSQL(diff({
        action: "added",
        tableName: name,
        columns: [{ action: "added", columnName: name, targetType: "INTEGER", changes: [] }],
        indexes: [{ action: "added", indexName, targetColumns: [name], changes: [] }],
        foreignKeys: [{ action: "added", columnName: name, targetReferencedTable: "sentinel", targetReferencedColumn: "id", changes: [] }],
      }), "sqlite");
      expect(sql).toContain(`CREATE TABLE ${q(name)}`);
      expect(sql).toContain(`CREATE INDEX ${q(indexName)} ON ${q(name)} (${q(name)})`);
      expect(sql).toContain(`FOREIGN KEY (${q(name)}) REFERENCES "sentinel"("id")`);
      db.exec(sql);
      db.exec(`INSERT INTO ${q(name)} (${q(name)}) VALUES (1)`);
      expect(() => db.exec(`INSERT INTO ${q(name)} (${q(name)}) VALUES (2)`)).toThrow();
      expect(db.query("SELECT * FROM sentinel").all()).toEqual([{ id: 1 }]);
    } finally {
      db.close();
    }
  });
});
