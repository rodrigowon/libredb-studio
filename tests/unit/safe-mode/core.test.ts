import { describe, expect, test } from "bun:test";
import { classifySql } from "@/lib/safe-mode/classify";
import { SQL_CLASSIFICATION_LIMITS as limits } from "@/lib/safe-mode/limits";
import type { SqlDialect } from "@/lib/safe-mode/types";
import { generateMigrationSQL } from "@/lib/schema-diff/migration-generator";
import type { SchemaDiff } from "@/lib/schema-diff/types";

const dialects: SqlDialect[] = ["postgres", "mysql", "sqlite"];
const classify = (sql: string, dialect: SqlDialect = "postgres") => classifySql({ sql, dialect });

describe("classification invariants", () => {
  test("opaque parameters and provenance remain bound to effective input without interpolation", () => {
    const parameters = Object.freeze(["'; DELETE FROM users; --"]);
    const input = Object.freeze({ sql: "SELECT $1", originalSql: "  SELECT $1  ", parameters, dialect: "postgres" });
    const r = classifySql(input);
    expect(r.parameters).toBe(parameters);
    expect(r.originalSql).toBe(input.originalSql);
    expect(r.effectiveSql).toBe(input.sql);
    expect(r).toEqual(classifySql(input));
  });
  for (const dialect of [
    "oracle",
    "duckdb",
    "redis",
    "mongodb",
    "cassandra",
    "clickhouse",
    "trino",
    "",
    "PostgreSQL",
    "constructor",
    "__proto__",
  ])
    test(`unsupported ${dialect}`, () => {
      const r = classifySql({ sql: "SELECT 1", dialect });
      expect(r.status).toBe("unsupported");
      expect(r.statements).toEqual([]);
      expect(r.aggregateEffects).toContain("unknown-effects");
    });
  for (const sql of [
    "",
    "-- nothing",
    "SELECT",
    "SELECT 1 garbage nonsense",
    "SELECT 1; FUTURE command",
    "WITH x AS NOT (SELECT 1) SELECT 1",
    "SELECT 1\0; DELETE FROM x",
    "SELECT (1",
    "SELECT 1)",
    "SELECT 'unterminated",
    "SELECT 1 /* incomplete",
  ])
    test(`no unjustified certainty: ${sql}`, () => {
      expect(classify(sql).status).not.toBe("classified");
      expect(classify(sql).aggregateEffects).toContain("unknown-effects");
    });
  test("unknown statement preserves order and known effects", () => {
    const r = classify("SELECT 1; FUTURE x; DELETE FROM t");
    expect(r.statements.map((s) => s.operation)).toEqual(["select", "future", "delete"]);
    expect(r.status).toBe("partial");
    expect(r.aggregateEffects).toEqual(["read", "unknown", "unknown-effects", "write"]);
  });
  for (const sql of [
    "SELECT dangerous_function()",
    'SELECT "DELETE"()',
    "SELECT * FROM users WHERE f(id) = 1",
    "SELECT pg_catalog.set_config('x','y',false)",
    "SELECT * FROM users FOR UPDATE",
  ])
    test(`indirect/locking: ${sql}`, () => {
      const r = classify(sql);
      expect(r.status).toBe("partial");
      expect(r.aggregateEffects).not.toEqual(["read"]);
    });
});

describe("limited CTE walker and WHERE ownership", () => {
  test("a malformed WITH cannot borrow EXPLAIN's non-execution edge to hide its CTE", () => {
    const r = classify("WITH x AS (DELETE FROM t RETURNING *) EXPLAIN SELECT 1");
    expect(r.status).not.toBe("classified");
    expect(r.aggregateEffects).toContain("write");
  });
  for (const body of [
    "DELETE FROM t RETURNING *",
    "UPDATE t SET x=1 RETURNING *",
    "INSERT INTO t(x) VALUES (1) RETURNING *",
  ])
    test(body, () => {
      const r = classify(`WITH x AS (${body}), y AS (WITH z AS (SELECT * FROM x) SELECT * FROM z) SELECT * FROM y`);
      expect(r.aggregateEffects).toContain("write");
      expect(r.statements[0].operation).toBe("select");
      expect(r.statements[0].children[0].operation).toBe(body.split(" ")[0].toLowerCase());
      expect(r.statements[0].children).toHaveLength(2);
    });
  for (const dialect of ["mysql", "sqlite"] as const)
    test(`modifying CTE outside ${dialect} subset`, () => {
      const r = classify("WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x", dialect);
      expect(r.status).not.toBe("classified");
      expect(r.aggregateEffects).toContain("write");
    });
  for (const [sql, where] of [
    ["DELETE FROM t", false],
    ["DELETE FROM t WHERE true", true],
    ["DELETE FROM t RETURNING (SELECT x FROM y WHERE x=1)", false],
    ["UPDATE t SET x=(SELECT x FROM y WHERE x=1)", false],
    ["DELETE FROM t WHERE id IN (SELECT id FROM y WHERE id=1)", true],
    ["UPDATE t SET x='WHERE' /* WHERE */", false],
    ["DELETE u FROM t u JOIN x ON u.id=x.id WHERE u.id=1", "unknown"],
    ["UPDATE t u, x SET u.id=1", "unknown"],
    ["DELETE FROM t WHERE", "unknown"],
    ["DELETE FROM t RETURNING WHERE", false],
  ] as const)
    test(`outer WHERE: ${sql}`, () => {
      const r = classify(sql);
      expect(r.statements[0].hasWhere).toBe(where);
      expect(r.statements[0].scopeIsSafe).toBe("not-proven");
    });
});

describe("EXPLAIN never manufactures ANALYZE", () => {
  for (const sql of [
    "EXPLAIN () SELECT 1",
    "EXPLAIN (FORMAT JSON,) SELECT 1",
    "EXPLAIN COMMIT",
    "EXPLAIN EXPLAIN SELECT 1",
  ])
    test(`outside explain subset: ${sql}`, () => {
      expect(classify(sql).status).not.toBe("classified");
    });
  for (const prefix of [
    "EXPLAIN",
    "EXPLAIN (ANALYZE FALSE)",
    "EXPLAIN (ANALYZE OFF, FORMAT JSON)",
    "EXPLAIN (FORMAT TEXT, ANALYZE 0)",
  ])
    test(prefix, () => {
      const r = classify(`${prefix} DELETE FROM t`);
      expect(r.statements[0].explainMode).toBe("estimate");
      expect(r.statements[0].executesChildren).toBe(false);
      expect(r.statements[0].children[0].effects).toContain("write");
      expect(r.aggregateEffects).toEqual(["read"]);
    });
  for (const prefix of [
    "EXPLAIN ANALYZE",
    "EXPLAIN (ANALYZE)",
    "EXPLAIN (ANALYSE TRUE)",
    "EXPLAIN (ANALYZE ON, FORMAT JSON)",
  ])
    test(prefix, () => {
      const r = classify(`${prefix} DELETE FROM t`);
      expect(r.statements[0].explainMode).toBe("analyze");
      expect(r.aggregateEffects).toContain("write");
    });
  for (const prefix of [
    "EXPLAIN (ANALYZE MAYBE)",
    "EXPLAIN (ANALYZE, ANALYSE FALSE)",
    "EXPLAIN (COSTS OFF)",
    "EXPLAIN (ANALYZE 'false')",
  ])
    test(`unrecognized options ${prefix}`, () => {
      const r = classify(`${prefix} DELETE FROM t`);
      expect(r.statements[0].explainMode).toBe("unknown");
      expect(r.aggregateEffects).toContain("write");
      expect(r.status).not.toBe("classified");
    });
  test("planning a function is not a purity proof", () => {
    expect(classify("EXPLAIN SELECT f()").aggregateEffects).toContain("indirect");
  });
});

describe("dialect-aware lexical boundaries", () => {
  test("optimizer hints and backslash mode ambiguity cannot gain full certainty", () => {
    for (const dialect of dialects) {
      expect(classify("SELECT /*+ SET_VAR(sort_buffer_size=1000000) */ 1", dialect).status).not.toBe("classified");
      expect(classify("SELECT 'x\\' ; DELETE FROM users; -- '", dialect).status).not.toBe("classified");
    }
  });
  for (const dialect of dialects)
    for (const trivia of [" ", "\n", "\t", " /* inert DELETE ; */ "])
      for (const verb of ["delete", "DELETE", "DeLeTe"])
        test(`${dialect} ${JSON.stringify(trivia)} ${verb}`, () => {
          const r = classify(
            `${verb}${trivia}FROM${trivia}users${trivia}WHERE${trivia}id=1; SELECT 'DROP; UPDATE';`,
            dialect,
          );
          expect(r.aggregateEffects).toEqual(["read", "write"]);
          expect(r.statements.map((s) => s.operation)).toEqual(["delete", "select"]);
          expect(r.statements[0].hasWhere).toBe(true);
        });
  for (const [dialect, sql] of [
    ["postgres", "SELECT $$ DELETE; $$"],
    ["postgres", "SELECT $tag$DROP; $tag$"],
    ["postgres", 'SELECT "delete" FROM "update"'],
    ["mysql", "SELECT `delete` FROM `drop`"],
    ["sqlite", "SELECT [update] FROM [delete]"],
    ["sqlite", 'SELECT "update" FROM "delete"'],
    ["postgres", "/* outer /* DELETE; */ still comment */ SELECT 1"],
    ["mysql", "SELECT 1 # DELETE;\n"],
    ["mysql", "SELECT 1-- DELETE;\n"],
    ["sqlite", "SELECT 1-- text\rDELETE FROM t"],
  ] as const)
    test(`${dialect} opaque ${sql}`, () => {
      expect(classify(sql, dialect).aggregateEffects).toEqual(["read"]);
    });
  test("MySQL no-space dash does not hide the next statement", () => {
    const r = classify("SELECT 1--1; DELETE FROM users", "mysql");
    expect(r.statements.map((s) => s.operation)).toEqual(["select", "delete"]);
    expect(r.aggregateEffects).toContain("write");
  });
  for (const newline of ["\n", "\r\n", "\r"])
    test(`MySQL empty hash comment ${JSON.stringify(newline)}`, () => {
      const r = classify(`SELECT 1 #${newline}; DELETE FROM users`, "mysql");
      expect(r.statements.map((s) => s.operation)).toEqual(["select", "delete"]);
      expect(r.aggregateEffects).toContain("write");
    });
  for (const sql of [
    "SELECT 1; /*!50000 DELETE FROM t */;",
    "SELECT 1 /*! INTO OUTFILE '/tmp/x' */",
    "/*! UPDATE t SET x=1 */",
    "/*!50000 SELECT 'DELETE;' */",
    "/*! DELETE FROM t",
  ])
    test(`executable comment: ${sql}`, () => {
      const r = classify(sql, "mysql");
      expect(r.status).not.toBe("classified");
      expect(r.aggregateEffects).toContain("unknown-effects");
    });
  test("SQLite closing bracket cannot hide an actual following statement", () => {
    expect(classify("SELECT [x]]; DELETE FROM t; -- ]", "sqlite").aggregateEffects).toContain("write");
  });
  test("non-PG dollar syntax is not allowed to hide a write", () => {
    for (const dialect of ["mysql", "sqlite"] as const) {
      const r = classify("SELECT $$; DELETE FROM t; $$", dialect);
      expect(r.status).not.toBe("classified");
      expect(r.aggregateEffects).toContain("write");
    }
  });
});

describe("deterministic whole-input resource budgets", () => {
  const cases: Array<[string, string]> = [
    ["sqlCodeUnits", "SELECT 1;" + " ".repeat(limits.sqlCodeUnits)],
    ["tokens", "SELECT " + "1,".repeat(limits.tokens)],
    ["statements", "SELECT 1;".repeat(limits.statements + 1)],
    ["depth", "SELECT " + "(".repeat(limits.depth + 1) + "1" + ")".repeat(limits.depth + 1)],
    ["structures", "SELECT " + Array.from({ length: limits.structures + 1 }, () => "(SELECT 1)").join(",")],
    ["evidence", "SELECT " + "f(),".repeat(limits.evidence + 1)],
  ];
  for (const [resource, sql] of cases)
    test(resource, () => {
      const r = classify(sql);
      expect(r.status).toBe("unknown");
      expect(r.limitations).toContain(`limit-exceeded:${resource}`);
      expect(r.statements).toEqual([]);
      expect(r.aggregateEffects).toEqual(["unknown-effects"]);
      expect(r.effectiveSql).toBe(sql);
    });
  test("size boundary is inclusive, never clipped", () => {
    const sql = "SELECT 1".padEnd(limits.sqlCodeUnits, " ");
    expect(classify(sql).status).toBe("classified");
    expect(classify(sql + " ").status).toBe("unknown");
  });
});

test("sanitized migration metadata is inert; actual extra command is retained", () => {
  const diff: SchemaDiff = {
    hasChanges: true,
    summary: { added: 0, removed: 1, modified: 0 },
    tables: [
      { tableName: "items\nDELETE FROM users; --", action: "removed", columns: [], indexes: [], foreignKeys: [] },
    ],
  };
  for (const dialect of dialects) {
    const sql = generateMigrationSQL(diff, dialect);
    const r = classify(sql, dialect);
    expect(r.aggregateEffects).toContain("schema");
    expect(r.aggregateEffects).not.toContain("write");
    expect(classify(sql + "\nDELETE FROM users;", dialect).aggregateEffects).toContain("write");
  }
});
