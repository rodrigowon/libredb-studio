import { DIALECTS, expectation, statement as s, type Dialect, type SqlCase, type StatementExpectation } from "./model";
import { generatedCases } from "./generated-cases";

type Row = [id: string, sql: string, statements: StatementExpectation[], purpose: string];
const read = () => s("read", "select");
const write = (operation: string, hasWhere?: boolean) =>
  s("write", operation, hasWhere === undefined ? {} : { hasWhere });
const ddl = (operation: string) => s("schema", operation);
const common: Row[] = [
  ["select-one", "SELECT 1;", [read()], "Minimal recognized read"],
  ["select-table", "SELECT * FROM users;", [read()], "Table read; not proof against views/RLS/extensions"],
  ["insert-values", "INSERT INTO users(name) VALUES ('A');", [write("insert")], "INSERT VALUES writes"],
  [
    "insert-select",
    "INSERT INTO users(name) SELECT name FROM archived;",
    [s("write", "insert", { children: [read()] })],
    "INSERT SELECT retains both effects",
  ],
  ["update-where", "UPDATE users SET active = false WHERE id = 1;", [write("update", true)], "Outer UPDATE predicate"],
  ["update-all", "UPDATE users SET active = false;", [write("update", false)], "UPDATE without predicate"],
  ["delete-where", "DELETE FROM users WHERE id = 1;", [write("delete", true)], "Outer DELETE predicate"],
  ["delete-all", "DELETE FROM users;", [write("delete", false)], "DELETE without predicate"],
  ["where-true", "DELETE FROM users WHERE true;", [write("delete", true)], "WHERE does not prove restricted scope"],
  [
    "where-tautology",
    "UPDATE users SET active=false WHERE 1=1;",
    [write("update", true)],
    "Constant true predicate is still hasWhere",
  ],
  [
    "update-string-where",
    "UPDATE users SET note = 'WHERE';",
    [write("update", false)],
    "Literal WHERE is not predicate",
  ],
  [
    "delete-comment-where",
    "DELETE FROM users /* WHERE id=1 */;",
    [write("delete", false)],
    "Comment WHERE is not predicate",
  ],
  [
    "update-subquery-where",
    "UPDATE users SET active = (SELECT active FROM settings WHERE id=1);",
    [s("write", "update", { hasWhere: false, children: [read()] })],
    "Inner WHERE does not bound outer UPDATE",
  ],
  [
    "delete-subquery-where",
    "DELETE FROM users WHERE id IN (SELECT id FROM archived WHERE active=false);",
    [s("write", "delete", { hasWhere: true, children: [read()] })],
    "Outer and nested predicates are distinct",
  ],
  ["drop-table", "DROP TABLE users;", [ddl("drop-table")], "Destructive table DDL"],
  ["drop-view", "DROP VIEW user_view;", [ddl("drop-view")], "View versus table"],
  ["create-table", "CREATE TABLE test(id INTEGER);", [ddl("create-table")], "Portable table DDL"],
  ["create-index", "CREATE INDEX idx_users ON users(name);", [ddl("create-index")], "Index DDL"],
  [
    "create-view",
    "CREATE VIEW user_view AS SELECT * FROM users;",
    [s("schema", "create-view", { children: [read()], executesChildren: false })],
    "View definition does not execute its SELECT",
  ],
  ["alter-table", "ALTER TABLE users ADD COLUMN test TEXT;", [ddl("alter-table")], "Column DDL"],
  ["begin", "BEGIN;", [s("transaction", "begin")], "Transaction opening"],
  ["commit", "COMMIT;", [s("transaction", "commit")], "Transaction commit"],
  ["rollback", "ROLLBACK;", [s("transaction", "rollback")], "Transaction rollback"],
  ["savepoint", "SAVEPOINT checkpoint;", [s("transaction", "savepoint")], "Savepoint control"],
  ["release", "RELEASE SAVEPOINT checkpoint;", [s("transaction", "release")], "Savepoint release"],
  [
    "mixed-batch",
    "SELECT 1; DELETE FROM customers;",
    [read(), write("delete", false)],
    "Must preserve second statement and aggregate write",
  ],
  [
    "batch-with-string-semicolon",
    "SELECT '; DELETE FROM users'; DELETE FROM customers WHERE id=1;",
    [read(), write("delete", true)],
    "Only code semicolon separates statements",
  ],
  ["comment-keyword", "-- DELETE FROM users;\nSELECT 1;", [read()], "Leading comment does not write"],
  [
    "block-comment-keyword",
    "/* DROP TABLE users */ SELECT 1 /* DELETE FROM users */;",
    [read()],
    "Leading/trailing ordinary comments",
  ],
  ["string-drop", "SELECT 'DROP TABLE users';", [read()], "Literal is not DROP"],
  ["string-delete", "SELECT 'DELETE FROM users';", [read()], "Literal is not DELETE"],
  ["string-escaped-quote", "SELECT 'it''s; DELETE FROM users';", [read()], "Doubled quote and embedded semicolon"],
  [
    "mixed-case",
    " \tDeLeTe\nFROM /* select */ users\nWHERE id=1;",
    [write("delete", true)],
    "Case, ASCII whitespace, inter-keyword comments",
  ],
  [
    "cte-read",
    "WITH x AS (SELECT * FROM users) SELECT * FROM x;",
    [s("read", "select", { children: [read()] })],
    "Read-only CTE shape",
  ],
  [
    "cte-nested-read",
    "WITH x AS (WITH y AS (SELECT 1 AS id) SELECT * FROM y) SELECT * FROM x;",
    [s("read", "select", { children: [s("read", "select", { children: [read()] })] })],
    "Nested read CTEs",
  ],
  [
    "cte-literal-write",
    "WITH x AS (SELECT 'DELETE' AS note) SELECT * FROM x;",
    [s("read", "select", { children: [read()] })],
    "Quoted write inside CTE is inert",
  ],
  [
    "function",
    "SELECT dangerous_function();",
    [s("read", "select", { children: [s("indirect", "function", { effects: ["indirect", "unknown-effects"] })] })],
    "No universal function purity assumption",
  ],
];

function rows(dialect: Dialect, entries: Row[]): SqlCase[] {
  return entries.map(([id, sql, statements, purpose]) => {
    const indirect = id === "function" || statements.some((item) => item.category === "indirect");
    return {
      id: `${dialect}/${id}`,
      dialect,
      sql,
      purpose,
      syntax: "valid",
      expected: expectation(
        statements,
        indirect ? "partial" : "classified",
        indirect ? ["Indirect effects require database context; not established by syntax"] : [],
      ),
    };
  });
}

const sharedPgMysql: Row[] = [
  ["drop-database", "DROP DATABASE example;", [ddl("drop-database")], "Database versus table DDL"],
  ["truncate", "TRUNCATE TABLE logs;", [ddl("truncate-table")], "TRUNCATE distinct from DELETE"],
  ["grant", "GRANT SELECT ON users TO x;", [s("privilege", "grant")], "Privilege grant"],
  ["revoke", "REVOKE SELECT ON users FROM x;", [s("privilege", "revoke")], "Privilege revocation"],
  ["start-transaction", "START TRANSACTION;", [s("transaction", "begin")], "Transaction alias"],
  ["set", "SET statement_timeout = 1000;", [s("control", "set")], "Context change (variable resolution is not syntax)"],
  [
    "call",
    "CALL refresh_data();",
    [s("indirect", "call", { effects: ["indirect", "unknown-effects"] })],
    "Procedure has unknown effects",
  ],
];

const pg: Row[] = [
  ["drop-index", "DROP INDEX idx_users;", [ddl("drop-index")], "PG index grammar"],
  ["vacuum", "VACUUM;", [s("maintenance", "vacuum")], "Maintenance command"],
  ["vacuum-full", "VACUUM FULL;", [s("maintenance", "vacuum-full")], "Full rewrite distinct from VACUUM"],
  ["analyze", "ANALYZE users;", [s("maintenance", "analyze")], "Statistics collection is not simple read"],
  ["reindex", "REINDEX TABLE users;", [s("maintenance", "reindex")], "Index maintenance"],
  [
    "delete-returning-where",
    "DELETE FROM users RETURNING 'WHERE';",
    [write("delete", false)],
    "RETURNING literal not predicate",
  ],
  [
    "delete-returning-subquery",
    "DELETE FROM users RETURNING (SELECT id FROM settings WHERE id=1);",
    [s("write", "delete", { hasWhere: false, children: [read()] })],
    "RETURNING subquery predicate does not bound deletion",
  ],
  ["dollar-string", "SELECT $$ DELETE FROM users; $$;", [read()], "Dollar quote is not executable SQL"],
  ["tagged-dollar", "SELECT $body$ 'WHERE'; DROP TABLE users $body$;", [read()], "Tagged dollar content"],
  ["identifier", 'SELECT "delete" FROM "update";', [read()], "Quoted names are not commands"],
  ["cast", "SELECT '1'::integer;", [read()], "PG cast"],
  ["json", "SELECT payload->>'name', payload #>> '{a,b}' FROM users;", [read()], "PG JSON operators are not comments"],
  ["nested-comment", "/* outer /* DELETE FROM users */ still comment */ SELECT 1;", [read()], "PG block comments nest"],
  [
    "cte-delete",
    "WITH deleted AS (DELETE FROM users WHERE id=1 RETURNING *) SELECT * FROM deleted;",
    [s("read", "select", { children: [write("delete", true)] })],
    "Internal DELETE with predicate must survive",
  ],
  [
    "cte-update",
    "WITH updated AS (UPDATE users SET active=false RETURNING *) SELECT * FROM updated;",
    [s("read", "select", { children: [write("update", false)] })],
    "Internal unbounded UPDATE must survive",
  ],
  [
    "cte-nested-with-write",
    "WITH deleted AS (DELETE FROM users RETURNING *), x AS (WITH y AS (SELECT * FROM deleted) SELECT * FROM y) SELECT * FROM x;",
    [s("read", "select", { children: [write("delete", false), s("read", "select", { children: [read()] })] })],
    "Write CTE and nested read CTE",
  ],
  [
    "do",
    "DO $$ BEGIN DELETE FROM users; END $$;",
    [s("indirect", "do", { effects: ["indirect", "unknown-effects"] })],
    "Procedural body is opaque, not read-only",
  ],
  [
    "execute",
    "EXECUTE prepared_statement;",
    [s("indirect", "execute", { effects: ["indirect", "unknown-effects"] })],
    "Prepared statement effects unavailable",
  ],
  [
    "select-into",
    "SELECT * INTO users_copy FROM users;",
    [s("schema", "select-into", { effects: ["read", "write", "schema"] })],
    "SELECT-headed table creation",
  ],
];

const mysql: Row[] = [
  ["identifier", "SELECT `drop` FROM `delete`;", [read()], "Backtick quoted names"],
  ["double-string", 'SELECT "DELETE FROM users";', [read()], "MySQL default SQL mode string"],
  ["hash-comment", "SELECT 1 # ; DELETE FROM users\n;", [read()], "MySQL hash comment"],
  ["drop-index", "DROP INDEX idx_users ON users;", [ddl("drop-index")], "MySQL requires ON table"],
  ["analyze", "ANALYZE TABLE users;", [s("maintenance", "analyze")], "MySQL maintenance syntax"],
  [
    "update-join",
    "UPDATE users u JOIN settings s ON u.id=s.id SET u.active=false WHERE s.active=false;",
    [write("update", true)],
    "Joined UPDATE",
  ],
  [
    "update-multiple",
    "UPDATE users u, settings s SET u.active=false, s.active=false;",
    [write("update", false)],
    "Multiple UPDATE targets",
  ],
  [
    "delete-join",
    "DELETE u FROM users u JOIN settings s ON u.id=s.id;",
    [write("delete", false)],
    "JOIN ON is not WHERE",
  ],
  [
    "delete-multiple",
    "DELETE u,s FROM users u JOIN settings s ON u.id=s.id WHERE u.id=1;",
    [write("delete", true)],
    "Multiple DELETE targets",
  ],
  [
    "execute",
    "EXECUTE prepared_statement;",
    [s("indirect", "execute", { effects: ["indirect", "unknown-effects"] })],
    "Prepared execution",
  ],
  [
    "outfile",
    "SELECT * FROM users INTO OUTFILE '/tmp/export.csv';",
    [s("read", "select-outfile", { effects: ["read", "write"] })],
    "SELECT-headed filesystem write; fixture is never executed",
  ],
  [
    "executable-comment",
    "SELECT 1; /*!50000 DELETE FROM users */;",
    [read(), write("delete", false)],
    "Versioned MySQL comment is executable on matching versions",
  ],
  [
    "dash-not-comment",
    "SELECT 1--1; DELETE FROM users;",
    [read(), write("delete", false)],
    "MySQL -- needs following whitespace/control; arithmetic is not comment",
  ],
];

const sqlite: Row[] = [
  ["identifier", "SELECT [update] FROM [delete];", [read()], "SQLite bracket names"],
  ["drop-index", "DROP INDEX idx_users;", [ddl("drop-index")], "SQLite index grammar"],
  ["returning", "DELETE FROM users RETURNING 'WHERE';", [write("delete", false)], "SQLite RETURNING without predicate"],
  [
    "insert-returning",
    "INSERT INTO users(name) VALUES ('A') RETURNING id;",
    [write("insert")],
    "SQLite INSERT RETURNING",
  ],
  [
    "update-returning",
    "UPDATE users SET active=false WHERE id=1 RETURNING id;",
    [write("update", true)],
    "SQLite UPDATE RETURNING",
  ],
  [
    "cte-update",
    "WITH x AS (SELECT 1 AS id) UPDATE users SET active=false WHERE id IN (SELECT id FROM x);",
    [s("write", "update", { hasWhere: true, children: [read(), read()] })],
    "WITH precedes modifying statement",
  ],
  ["pragma-read", "PRAGMA table_info(users);", [s("control", "pragma")], "PRAGMA explicitly not ordinary SELECT"],
  ["pragma-write", "PRAGMA query_only = OFF;", [s("control", "pragma")], "PRAGMA context mutation"],
  ["attach", "ATTACH DATABASE ':memory:' AS auxiliary;", [s("control", "attach")], "Database attachment"],
  ["detach", "DETACH DATABASE auxiliary;", [s("control", "detach")], "Database detachment"],
  ["vacuum", "VACUUM;", [s("maintenance", "vacuum")], "SQLite maintenance"],
  ["analyze", "ANALYZE users;", [s("maintenance", "analyze")], "SQLite statistics"],
  ["reindex", "REINDEX idx_users;", [s("maintenance", "reindex")], "SQLite index rebuild"],
  ["replace", "REPLACE INTO users(id,name) VALUES (1,'A');", [write("replace")], "Replacement writes"],
];

const explainCases: SqlCase[] = DIALECTS.flatMap((dialect) => {
  const modes = dialect === "sqlite" ? (["estimate"] as const) : (["estimate", "analyze"] as const);
  return modes.flatMap((mode) => {
    const underlying =
      dialect === "postgres" ? ["SELECT * FROM users", "DELETE FROM customers"] : ["SELECT * FROM users"];
    return underlying.map((originalSql) => {
      const sql = `EXPLAIN ${mode === "analyze" ? "ANALYZE " : ""}${originalSql};`;
      const child = originalSql.startsWith("DELETE") ? write("delete", false) : read();
      return {
        id: `${dialect}/explain-${mode}-${child.operation}`,
        dialect,
        sql,
        syntax: "valid" as const,
        purpose: "EXPLAIN intention and execution effects are separate from original SQL",
        context: { originalSql, intent: mode, effectiveSql: sql },
        expected: expectation([
          s("read", "explain", { explainMode: mode, children: [child], executesChildren: mode === "analyze" }),
        ]),
      };
    });
  });
});

const invalidSql: Array<[string, string]> = [
  ["incomplete-select", "SELECT"],
  ["incomplete-update", "UPDATE users SET"],
  ["incomplete-delete", "DELETE FROM"],
  ["incomplete-cte", "WITH x AS ("],
  ["unterminated-string", "SELECT 'DELETE FROM users"],
  ["unterminated-comment", "SELECT 1 /* DELETE"],
  ["exec", "EXEC refresh_data;"],
  ["malformed-cte", "WITH x AS DELETE, foo AS (SELECT 1) SELECT 1;"],
];
const invalidCases: SqlCase[] = DIALECTS.flatMap((dialect) =>
  invalidSql.map(([id, sql]): SqlCase => {
    // PostgreSQL really permits an empty target list. Still abstain on this editor
    // fragment as requested; do not misreport parser acceptance as a syntax bug.
    const emptyPgSelect = dialect === "postgres" && id === "incomplete-select";
    return {
      id: `${dialect}/${id}`,
      dialect,
      sql,
      syntax: emptyPgSelect ? "valid" : "invalid",
      purpose: emptyPgSelect
        ? "PG empty target list is valid syntax but this editor fragment remains unclassified in the proposed subset"
        : "Invalid/incomplete SQL must never acquire read confidence",
      expected: expectation([], emptyPgSelect ? "unknown" : "invalid", [
        emptyPgSelect
          ? "Empty target list outside proposed recognized-read subset"
          : "Syntax not recognized; parser rejection alone cannot distinguish unsupported valid SQL from malformed SQL",
      ]),
    };
  }),
);

const crossDialect: SqlCase[] = [
  ...(["mysql", "sqlite"] as const).map(
    (dialect): SqlCase => ({
      id: `${dialect}/invalid-pg-cast`,
      dialect,
      sql: "SELECT '1'::integer;",
      syntax: "invalid",
      purpose: "Do not accept PostgreSQL-only syntax through a permissive dialect grammar",
      expected: expectation([], "invalid"),
    }),
  ),
  ...(["postgres", "sqlite"] as const).map(
    (dialect): SqlCase => ({
      id: `${dialect}/invalid-hash-comment`,
      dialect,
      sql: "# DELETE FROM users\nSELECT 1;",
      syntax: "invalid",
      purpose: "Hash is not a leading SQL comment in this dialect",
      expected: expectation([], "invalid"),
    }),
  ),
  {
    id: "sqlite/invalid-modifying-cte",
    dialect: "sqlite",
    sql: "WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x;",
    syntax: "invalid",
    purpose: "SQLite CTE body cannot be DELETE",
    expected: expectation([], "invalid"),
  },
  {
    id: "sqlite/invalid-truncate",
    dialect: "sqlite",
    sql: "TRUNCATE TABLE users;",
    syntax: "invalid",
    purpose: "SQLite has no TRUNCATE",
    expected: expectation([], "invalid"),
  },
];

export const corpus: SqlCase[] = [
  ...DIALECTS.flatMap((dialect) => rows(dialect, common)),
  ...rows("postgres", sharedPgMysql),
  ...rows("mysql", sharedPgMysql),
  ...rows("postgres", pg),
  ...rows("mysql", mysql),
  ...rows("sqlite", sqlite),
  ...explainCases,
  ...invalidCases,
  ...crossDialect,
  ...generatedCases,
  ...DIALECTS.map(
    (dialect): SqlCase => ({
      id: `${dialect}/unknown`,
      dialect,
      sql: "FUTURE COMMAND users;",
      purpose: "Unknown vocabulary never falls back to read",
      syntax: "unknown",
      expected: expectation([], "unknown", ["Unknown syntax"]),
    }),
  ),
  {
    id: "unsupported/provider",
    dialect: "unsupported-engine",
    sql: "SELECT 1;",
    syntax: "unknown",
    purpose: "Unknown provider never borrows PostgreSQL grammar",
    expected: expectation([], "unsupported", ["Unsupported dialect"]),
  },
];
