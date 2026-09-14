import { mysqlAdapter } from "./adapters/mysql";
import { postgresAdapter } from "./adapters/postgres";
import { sqliteAdapter } from "./adapters/sqlite";
import { ClassificationLimitExceeded, checkLimit } from "./limits";
import { lexSql, type Token } from "./lex";
import type { ClassifiedStatement, SqlCategory, SqlClassification, SqlClassificationInput, SqlEffect } from "./types";

const adapters = { postgres: postgresAdapter, mysql: mysqlAdapter, sqlite: sqliteAdapter };
const effectsByVerb: Readonly<Record<string, SqlCategory>> = {
  SELECT: "read",
  INSERT: "write",
  UPDATE: "write",
  DELETE: "write",
  REPLACE: "write",
  MERGE: "write",
  CREATE: "schema",
  ALTER: "schema",
  DROP: "schema",
  TRUNCATE: "schema",
  GRANT: "privilege",
  REVOKE: "privilege",
  VACUUM: "maintenance",
  ANALYZE: "maintenance",
  REINDEX: "maintenance",
  BEGIN: "transaction",
  START: "transaction",
  COMMIT: "transaction",
  ROLLBACK: "transaction",
  SAVEPOINT: "transaction",
  RELEASE: "transaction",
  PRAGMA: "control",
  ATTACH: "control",
  DETACH: "control",
  SET: "control",
  RESET: "control",
  USE: "control",
  CALL: "indirect",
  DO: "indirect",
  EXEC: "indirect",
  EXECUTE: "indirect",
  COPY: "indirect",
};
const reserved = new Set(
  "SELECT FROM WHERE AS INTO OUTFILE DUMPFILE FOR UPDATE SHARE LOCK UNION INTERSECT EXCEPT JOIN LEFT RIGHT FULL INNER CROSS ON USING GROUP ORDER HAVING LIMIT OFFSET FETCH RETURNING SET VALUES INSERT DELETE CREATE ALTER DROP TRUNCATE GRANT REVOKE CALL DO EXEC EXECUTE WITH RECURSIVE AND OR NOT IN IS NULL TRUE FALSE DISTINCT ALL WINDOW OVER".split(
    " ",
  ),
);
const unique = (effects: SqlEffect[]): SqlEffect[] => [...new Set(effects)].sort();
const word = (token: Token | undefined, value: string) => token?.kind === "word" && token.value === value;
const name = (token: Token | undefined) =>
  !!token && (token.kind === "name" || (token.kind === "word" && !reserved.has(token.value)));

/** Small non-recursive recognizer for atoms/lists/predicates, NOT expression grammar. */
class SimpleShape {
  at = 0;
  constructor(readonly tokens: Token[]) {}
  take(value: string): boolean {
    const token = this.tokens[this.at];
    if (token && (token.kind === "word" || token.kind === "symbol") && token.value === value) {
      this.at++;
      return true;
    }
    return false;
  }
  identifier(): boolean {
    if (!name(this.tokens[this.at])) return false;
    this.at++;
    if (this.take(".")) {
      if (!name(this.tokens[this.at])) return false;
      this.at++;
    }
    return true;
  }
  atom(): boolean {
    const token = this.tokens[this.at];
    if (
      token &&
      (["literal", "number"].includes(token.kind) || ["TRUE", "FALSE", "NULL"].some((v) => word(token, v)))
    ) {
      this.at++;
      return true;
    }
    return this.identifier();
  }
  predicate(): boolean {
    if (!this.atom()) return false;
    if (this.take("=")) return this.atom();
    return true;
  }
  done(): boolean {
    return this.at === this.tokens.length;
  }
}

function simpleSelect(tokens: Token[]): boolean {
  const p = new SimpleShape(tokens);
  if (!p.take("SELECT")) return false;
  do {
    if (!p.take("*") && !p.atom()) return false;
    if (p.take("AS") && !p.identifier()) return false;
  } while (p.take(","));
  if (p.take("FROM") && !p.identifier()) return false;
  if (p.take("WHERE") && !p.predicate()) return false;
  return p.done();
}

function simpleWrite(tokens: Token[]): boolean {
  const p = new SimpleShape(tokens);
  const insert = word(tokens[0], "INSERT");
  if (p.take("DELETE")) {
    if (!p.take("FROM") || !p.identifier()) return false;
  } else if (p.take("UPDATE")) {
    if (!p.identifier() || !p.take("SET")) return false;
    do {
      if (!p.identifier() || !p.take("=") || !p.atom()) return false;
    } while (p.take(","));
  } else if (p.take("INSERT")) {
    if (!p.take("INTO") || !p.identifier()) return false;
    if (p.take("(")) {
      do {
        if (!p.identifier()) return false;
      } while (p.take(","));
      if (!p.take(")")) return false;
    }
    if (!p.take("VALUES")) return false;
    do {
      if (!p.take("(")) return false;
      do {
        if (!p.atom()) return false;
      } while (p.take(","));
      if (!p.take(")")) return false;
    } while (p.take(","));
  } else return false;
  if (p.take("WHERE") && (insert || !p.predicate())) return false;
  if (p.take("RETURNING")) {
    do {
      if (!p.take("*") && !p.atom()) return false;
    } while (p.take(","));
  }
  return p.done();
}

/** Pure, synchronous, bounded. No provider imports, SQL execution or authorization. */
export function classifySql(input: SqlClassificationInput): SqlClassification {
  const base: SqlClassification = {
    status: "unknown",
    dialect: input.dialect,
    originalSql: input.originalSql ?? input.sql,
    effectiveSql: input.sql,
    parameters: input.parameters,
    statements: [],
    aggregateEffects: ["unknown-effects"],
    limitations: [],
    certainty: "incomplete",
    scopeIsSafe: "not-proven",
  };
  if (!Object.hasOwn(adapters, input.dialect))
    return { ...base, status: "unsupported", limitations: ["unsupported-dialect"] };
  const adapter = adapters[input.dialect as keyof typeof adapters];
  try {
    checkLimit("sqlCodeUnits", input.sql.length);
    const lexical = lexSql(input.sql, adapter.dialect);
    const tokens = lexical.tokens;
    const pairs = new Map<number, number>();
    const stack: number[] = [];
    let malformed = false;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].kind !== "symbol") continue;
      if (tokens[i].value === "(") {
        stack.push(i);
        checkLimit("depth", stack.length);
      }
      if (tokens[i].value === ")") {
        const open = stack.pop();
        if (open === undefined) malformed = true;
        else pairs.set(open, i);
      }
    }
    if (stack.length || malformed) lexical.limitations.push("unbalanced-parentheses");
    let structures = 0;
    let evidenceCount = 0;
    const make = (from: number, to: number, operation: string, category: SqlCategory): ClassifiedStatement => {
      checkLimit("structures", ++structures);
      const start = tokens[from]?.start ?? 0;
      const end = tokens[to - 1]?.end ?? start;
      const s: ClassifiedStatement = {
        status: category === "unknown" ? "unknown" : "partial",
        category,
        operation,
        start,
        end,
        sql: input.sql.slice(start, end),
        effects: [category],
        aggregateEffects: [],
        evidence: [],
        children: [],
        limitations: [],
        scopeIsSafe: "not-proven",
      };
      return s;
    };
    const evidence = (
      s: ClassifiedStatement,
      token: Token,
      operation: string,
      effect: SqlEffect,
      kind: "operation" | "possible-effect" | "function-invocation" = "operation",
    ) => {
      checkLimit("evidence", ++evidenceCount);
      s.evidence.push({ kind, operation, effect, start: token.start, end: token.end });
      s.effects.push(effect);
    };
    const partial = (s: ClassifiedStatement, why: string) => {
      if (s.status === "classified") s.status = "partial";
      s.limitations.push(why);
      s.effects.push("unknown-effects");
    };
    const finish = (s: ClassifiedStatement): ClassifiedStatement => {
      if (s.children.some((child) => child.status !== "classified")) partial(s, "child-not-fully-recognized");
      if (s.status !== "classified") s.effects.push("unknown-effects");
      s.effects = unique(s.effects);
      s.aggregateEffects = unique([
        ...s.effects,
        ...(s.executesChildren === false ? [] : s.children.flatMap((child) => child.aggregateEffects)),
      ]);
      s.limitations = [...new Set(s.limitations)];
      return s;
    };
    const topLevel = (from: number, to: number): number[] => {
      const out: number[] = [];
      for (let i = from; i < to; i++) {
        out.push(i);
        const close = pairs.get(i);
        if (close !== undefined && close < to) i = close;
      }
      return out;
    };
    // Unrecognized structure never earns certainty from the following evidence scan.
    const uncertainEffects = (s: ClassifiedStatement, from: number, to: number) => {
      for (let i = from; i < to; i++) {
        const t = tokens[i];
        if (t.kind !== "word" || !Object.hasOwn(effectsByVerb, t.value)) continue;
        evidence(s, t, t.value.toLowerCase(), effectsByVerb[t.value], "possible-effect");
      }
    };
    const classify = (from: number, to: number, depth: number): ClassifiedStatement => {
      checkLimit("depth", depth);
      const head = tokens[from];
      const verb = head?.kind === "word" ? head.value : "";
      if (verb === "WITH") {
        let at = from + 1;
        if (word(tokens[at], "RECURSIVE")) at++;
        const children: ClassifiedStatement[] = [];
        let recognized = true;
        while (at < to) {
          if (!name(tokens[at])) {
            recognized = false;
            break;
          }
          at++;
          if (tokens[at]?.value === "(") {
            const close = pairs.get(at);
            if (close === undefined || close >= to) {
              recognized = false;
              break;
            }
            const columns = new SimpleShape(tokens.slice(at + 1, close));
            do {
              if (!columns.identifier()) {
                recognized = false;
                break;
              }
            } while (columns.take(","));
            if (!recognized || !columns.done()) {
              recognized = false;
              break;
            }
            at = close + 1;
          }
          if (!word(tokens[at], "AS")) {
            recognized = false;
            break;
          }
          at++;
          if (word(tokens[at], "NOT")) {
            if (!word(tokens[at + 1], "MATERIALIZED")) {
              recognized = false;
              break;
            }
            at++;
          }
          if (word(tokens[at], "MATERIALIZED")) {
            if (adapter.dialect === "mysql") {
              recognized = false;
              break;
            }
            at++;
          }
          const close = pairs.get(at);
          if (tokens[at]?.value !== "(" || close === undefined || close >= to || close === at + 1) {
            recognized = false;
            break;
          }
          const child = classify(at + 1, close, depth + 1);
          if (!["select", "insert", "update", "delete"].includes(child.operation)) {
            partial(child, "cte-body-operation-outside-subset");
          }
          if (!adapter.modifyingCte && child.aggregateEffects.includes("write"))
            partial(child, "dialect-modifying-cte-unsupported");
          children.push(finish(child));
          at = close + 1;
          if (tokens[at]?.value !== ",") break;
          at++;
        }
        if (
          !recognized ||
          !children.length ||
          at >= to ||
          !["SELECT", "INSERT", "UPDATE", "DELETE"].some((v) => word(tokens[at], v))
        ) {
          const s = make(from, to, "with", "unknown");
          s.children = children;
          s.limitations.push("cte-shape-not-recognized");
          uncertainEffects(s, from, to);
          return finish(s);
        }
        const outer = classify(at, to, depth + 1);
        outer.start = head.start;
        outer.sql = input.sql.slice(outer.start, outer.end);
        outer.children = [...children, ...outer.children];
        return finish(outer);
      }
      if (verb === "EXPLAIN") {
        const s = make(from, to, "explain", "read");
        s.status = "classified";
        evidence(s, head, "explain", "read");
        let at = from + 1;
        let mode: "estimate" | "analyze" | "unknown" = "estimate";
        if (word(tokens[at], "ANALYZE") || word(tokens[at], "ANALYSE")) {
          mode = "analyze";
          at++;
        } else if (tokens[at]?.value === "(" && adapter.dialect === "postgres") {
          const close = pairs.get(at);
          if (close === undefined || close >= to) mode = "unknown";
          else {
            if (close === at + 1 || tokens[close - 1]?.value === ",") mode = "unknown";
            const seen = new Set<string>();
            for (let i = at + 1; i < close && mode !== "unknown"; ) {
              const option = tokens[i++];
              const key = option.value === "ANALYSE" ? "ANALYZE" : option.value;
              if (option.kind !== "word" || seen.has(key)) {
                mode = "unknown";
                break;
              }
              seen.add(key);
              if (["ANALYZE", "ANALYSE"].includes(option.value)) {
                const value = tokens[i];
                if (
                  value &&
                  ["FALSE", "OFF", "0"].includes(value.value) &&
                  value.kind !== "literal" &&
                  value.kind !== "name"
                ) {
                  mode = "estimate";
                  i++;
                } else if (
                  value &&
                  ["TRUE", "ON", "1"].includes(value.value) &&
                  value.kind !== "literal" &&
                  value.kind !== "name"
                ) {
                  mode = "analyze";
                  i++;
                } else mode = "analyze";
              } else if (option.value === "FORMAT" && (word(tokens[i], "JSON") || word(tokens[i], "TEXT"))) i++;
              else {
                mode = "unknown";
                break;
              }
              if (i < close && tokens[i++]?.value !== ",") {
                mode = "unknown";
                break;
              }
            }
            at = close + 1;
          }
        } else if (adapter.dialect === "sqlite" && word(tokens[at], "QUERY") && word(tokens[at + 1], "PLAN")) at += 2;
        else if (
          adapter.dialect === "mysql" &&
          word(tokens[at], "FORMAT") &&
          tokens[at + 1]?.value === "=" &&
          (word(tokens[at + 2], "JSON") || word(tokens[at + 2], "TREE") || word(tokens[at + 2], "TRADITIONAL"))
        )
          at += 3;
        if (adapter.dialect === "sqlite" && mode === "analyze") mode = "unknown";
        s.explainMode = mode;
        s.executesChildren = mode === "unknown" ? "unknown" : mode === "analyze";
        if (at < to) {
          const child = classify(at, to, depth + 1);
          s.children.push(child);
          if (
            ![
              "select",
              "select-into",
              "select-outfile",
              "insert",
              "update",
              "delete",
              "replace",
              "create-table",
              "execute",
            ].includes(child.operation)
          ) {
            partial(s, "explain-underlying-operation-outside-subset");
          }
        } else partial(s, "missing-explain-statement");
        if (mode === "unknown") partial(s, "explain-options-not-recognized");
        // Planning is not procedure purity: functions may be folded during planning.
        if (s.children.some((c) => c.aggregateEffects.includes("indirect"))) {
          s.effects.push("indirect");
          partial(s, "planning-effects-not-proven");
        }
        return finish(s);
      }

      const category = Object.hasOwn(effectsByVerb, verb) ? effectsByVerb[verb] : "unknown";
      const s = make(from, to, verb.toLowerCase() || "unknown", category);
      if (head && category !== "unknown") evidence(s, head, s.operation, category);
      if (adapter.unsupportedVerbs.includes(verb)) {
        s.status = "unsupported";
        s.limitations.push("dialect-statement-unsupported");
      }
      const top = topLevel(from, to);
      const topWord = (value: string) => top.find((i) => word(tokens[i], value));
      if (verb === "SELECT") {
        s.status = simpleSelect(tokens.slice(from, to)) ? "classified" : "partial";
        const into = topWord("INTO");
        if (into !== undefined) {
          if (adapter.dialect === "postgres") {
            s.operation = "select-into";
            s.category = "schema";
            s.effects.push("write", "schema");
          } else if (adapter.dialect === "mysql") {
            s.operation = "select-outfile";
            s.effects.push("write");
          }
          evidence(
            s,
            tokens[into],
            s.operation,
            adapter.dialect === "postgres" ? "schema" : "write",
            "possible-effect",
          );
          partial(s, "select-into-target-not-fully-recognized");
        }
        if (topWord("FOR") !== undefined || topWord("LOCK") !== undefined) {
          s.effects.push("control");
          partial(s, "locking-read");
        }
        if (to === from + 1) {
          s.status = "unknown";
          s.limitations.push("empty-target-list-outside-subset");
        }
      } else if (["UPDATE", "DELETE", "INSERT"].includes(verb)) {
        if (s.status !== "unsupported" && simpleWrite(tokens.slice(from, to))) s.status = "classified";
        if (adapter.dialect === "mysql" && topWord("RETURNING") !== undefined)
          partial(s, "dialect-returning-unsupported");
        if (verb !== "INSERT") {
          const p = new SimpleShape(tokens.slice(from + 1, to));
          const target = (verb === "DELETE" ? p.take("FROM") : true) && p.identifier();
          const start = from + 1 + p.at;
          const validStart = target && (verb === "DELETE" || word(tokens[start], "SET"));
          const returning = topWord("RETURNING") ?? to;
          const where = top.find((i) => i > start - 1 && i < returning && word(tokens[i], "WHERE"));
          // Multi-target/JOIN/USING and unbalanced structure have uncertain ownership.
          const complexTarget = top.some(
            (i) => i < (where ?? returning) && (word(tokens[i], "JOIN") || word(tokens[i], "USING")),
          );
          s.hasWhere = validStart && !complexTarget && !lexical.limitations.length ? where !== undefined : "unknown";
          if (verb === "UPDATE" && start + 1 >= to) s.hasWhere = "unknown";
          if (where !== undefined && where + 1 >= returning) s.hasWhere = "unknown";
        }
        const select = topWord("SELECT");
        if (verb === "INSERT" && select !== undefined) s.children.push(classify(select, to, depth + 1));
      } else if (category === "schema") {
        let at = from + 1;
        if (word(tokens[at], "OR") && word(tokens[at + 1], "REPLACE")) at += 2;
        while (["TEMP", "TEMPORARY", "UNIQUE", "UNLOGGED"].some((v) => word(tokens[at], v))) at++;
        if (["TABLE", "INDEX", "VIEW", "DATABASE"].some((v) => word(tokens[at], v)))
          s.operation += `-${tokens[at].value.toLowerCase()}`;
        else if (verb === "TRUNCATE") s.operation = "truncate-table";
        if (adapter.dialect === "sqlite" && s.operation === "drop-database") {
          s.status = "unsupported";
          s.limitations.push("dialect-statement-unsupported");
        }
        // Definition expressions, triggers and engine-specific DDL tails are not validated.
        s.limitations.push("ddl-body-outside-validated-subset");
        const select = topWord("SELECT");
        if (select !== undefined) {
          s.children.push(classify(select, to, depth + 1));
          if (s.operation === "create-view") s.executesChildren = false;
          else s.effects.push("write");
        }
      } else if (category === "transaction") {
        if (verb === "START") s.operation = "begin";
        const rest = tokens.slice(from + 1, to);
        if (
          (["BEGIN", "COMMIT", "ROLLBACK"].includes(verb) && rest.length === 0) ||
          (verb === "START" && rest.length === 1 && word(rest[0], "TRANSACTION") && adapter.dialect !== "sqlite") ||
          (verb === "SAVEPOINT" && rest.length === 1 && name(rest[0])) ||
          (verb === "RELEASE" && rest.length === 2 && word(rest[0], "SAVEPOINT") && name(rest[1]))
        )
          s.status = "classified";
      } else if (verb === "VACUUM" && word(tokens[from + 1], "FULL")) s.operation = "vacuum-full";

      if (category === "indirect") partial(s, "indirect-execution-effects-unknown");
      if (category === "control") partial(s, "session-or-database-control-effects-unknown");

      // Relevant nested queries are children; a call is evidence, not a purity decision.
      if (["SELECT", "UPDATE", "DELETE", "INSERT"].includes(verb)) {
        const insertSource = topWord("VALUES") ?? topWord("SELECT") ?? from;
        for (let i = from + 1; i < to; i++) {
          const close = pairs.get(i);
          if (tokens[i].value !== "(" || close === undefined || close >= to) continue;
          if (word(tokens[i + 1], "SELECT") || word(tokens[i + 1], "WITH")) {
            s.children.push(classify(i + 1, close, depth + 1));
            i = close;
          } else if (
            (name(tokens[i - 1]) || tokens[i - 1]?.kind === "name") &&
            !(verb === "INSERT" && i < insertSource)
          ) {
            evidence(s, tokens[i - 1], "function", "indirect", "function-invocation");
            partial(s, "function-purity-unknown");
          }
        }
      }
      if (s.status !== "classified") {
        s.limitations.push("outside-complete-recognized-subset");
        // A flat token occurrence is only POSSIBLE effect; no syntax assertion.
        // Known view/EXPLAIN definitions handle execution edges separately above.
        if (category === "unknown" || ["SELECT", "UPDATE", "DELETE", "INSERT"].includes(verb))
          uncertainEffects(s, from + 1, to);
      }
      return finish(s);
    };

    let from = 0;
    const statements: ClassifiedStatement[] = [];
    for (let i = 0; i <= tokens.length; i++) {
      if (i < tokens.length && !(tokens[i].kind === "symbol" && tokens[i].value === ";")) continue;
      if (from < i) {
        checkLimit("statements", statements.length + 1);
        statements.push(classify(from, i, 0));
      }
      from = i + 1;
    }
    const allClassified =
      statements.length > 0 && statements.every((s) => s.status === "classified") && !lexical.limitations.length;
    const status = allClassified
      ? "classified"
      : !statements.length ||
          lexical.limitations.some((l) => l === "unterminated-or-ambiguous-span" || l === "unbalanced-parentheses")
        ? "unknown"
        : statements.every((s) => s.status === "unsupported")
          ? "unsupported"
          : statements.every((s) => s.status === "unknown")
            ? "unknown"
            : "partial";
    return {
      ...base,
      status,
      statements,
      certainty: allClassified ? "recognized-subset" : "incomplete",
      aggregateEffects: unique([
        ...statements.flatMap((s) => s.aggregateEffects),
        ...(allClassified ? [] : ["unknown-effects" as const]),
      ]),
      limitations: [
        ...new Set([
          ...lexical.limitations,
          ...statements.flatMap((s) => s.limitations),
          ...(!statements.length ? ["no-recognized-statement"] : []),
        ]),
      ],
    };
  } catch (error) {
    if (error instanceof ClassificationLimitExceeded) return { ...base, limitations: [error.message] };
    // Programming errors must remain visible, never silently converted to a read.
    throw error;
  }
}
