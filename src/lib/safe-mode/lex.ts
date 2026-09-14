import { resolveSqlGrammar } from "@/lib/sql/grammar";
import { readSqlSpan } from "@/lib/sql/spans";
import { readSqlWord } from "@/lib/sql/words";
import { checkLimit } from "./limits";
import type { SqlDialect } from "./types";

export interface Token {
  kind: "word" | "name" | "literal" | "number" | "symbol";
  value: string;
  start: number;
  end: number;
}

/** Local dialect corrections only; shared scanners and their consumers are untouched. */
export function lexSql(sql: string, dialect: SqlDialect): { tokens: Token[]; limitations: string[] } {
  const grammar = resolveSqlGrammar(dialect);
  const tokens: Token[] = [];
  const limitations = new Set<string>();
  const push = (kind: Token["kind"], start: number, end: number) => {
    checkLimit("tokens", tokens.length + 1);
    tokens.push({
      kind,
      value: kind === "word" ? sql.slice(start, end).toUpperCase() : sql.slice(start, end),
      start,
      end,
    });
  };
  // Executable comment bodies are read as POTENTIAL code, not text substituted into SQL.
  const scan = (from: number, until: number, nesting: number) => {
    checkLimit("depth", nesting);
    for (let i = from; i < until; ) {
      const ch = sql[i];
      if (ch === "\0") limitations.add("nul-character");
      if (sql.startsWith("/*+", i)) limitations.add("optimizer-hint-effects-not-proven");
      if (dialect === "mysql" && sql.startsWith("/*!", i)) {
        limitations.add("mysql-executable-comment-version-or-mode-unknown");
        const close = sql.indexOf("*/", i + 3);
        if (close < 0 || close >= until) {
          limitations.add("unterminated-or-ambiguous-span");
          return;
        }
        let body = i + 3;
        while (body < close && /[0-9]/.test(sql[body])) body++;
        scan(body, close, nesting + 1);
        i = close + 2;
        continue;
      }
      // MySQL --1 is arithmetic. Other dialects always start a comment at --.
      const dash = sql.startsWith("--", i) && (dialect !== "mysql" || /[\x00-\x20]/.test(sql[i + 2] ?? ""));
      if (dash || (dialect === "mysql" && ch === "#")) {
        let end = i + (dash ? 2 : 1);
        // SQLite explicitly ends at LF, PG also recognizes CR. MySQL CR is
        // conservatively exposed as code if it differs from the active server.
        while (end < until && sql[end] !== "\n") {
          if (dialect !== "sqlite" && sql[end] === "\r") break;
          end++;
        }
        if (end < until && sql[end] === "\r" && dialect === "mysql") limitations.add("mysql-cr-comment-boundary");
        i = end;
        continue;
      }
      if (ch === "[" && dialect === "sqlite") {
        const end = sql.indexOf("]", i + 1);
        if (end < 0 || end >= until) {
          limitations.add("unterminated-or-ambiguous-span");
          return;
        }
        push("name", i, end + 1);
        i = end + 1;
        continue;
      }
      // Do not let the shared hybrid bracket/dollar/backtick rules hide code.
      const skipSpan = (ch === "-" && sql[i + 1] === "-") || ch === "[" || (ch === "$" && dialect !== "postgres");
      const span = skipSpan ? null : readSqlSpan(sql, i, grammar);
      if (span) {
        if (!span.terminated || span.end > until) {
          limitations.add("unterminated-or-ambiguous-span");
          return;
        }
        if (span.kind === "whitespace" || span.kind === "block-comment") {
          i = span.end;
          continue;
        }
        if (ch === "`" && dialect === "postgres") limitations.add("dialect-quote-unsupported");
        if ((ch === "'" || ch === '"') && dialect !== "sqlite" && sql.slice(i, span.end).includes("\\")) {
          limitations.add("backslash-mode-unknown");
        }
        push(
          span.kind === "quoted-identifier" && !(dialect === "mysql" && ch === '"') ? "name" : "literal",
          i,
          span.end,
        );
        i = span.end;
        continue;
      }
      const found = readSqlWord(sql, i);
      if (found) {
        if (found.end > until) {
          limitations.add("ambiguous-word-boundary");
          return;
        }
        push("word", i, found.end);
        i = found.end;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let end = i + 1;
        while (end < until && /[0-9]/.test(sql[end])) end++;
        push("number", i, end);
        i = end;
        continue;
      }
      push("symbol", i, i + 1);
      i++;
    }
  };
  scan(0, sql.length, 0);
  return { tokens, limitations: [...limitations] };
}
