import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { parse } from "@formatjs/icu-messageformat-parser";
import ts from "typescript";
import enAgent from "../../../messages/en/agent.json";
import ptAgent from "../../../messages/pt-BR/agent.json";
import enSafety from "../../../messages/en/query-safety.json";
import ptSafety from "../../../messages/pt-BR/query-safety.json";
import { loadMessages, mergeMessages } from "@/i18n/load-messages";
import { foldLedgerEntries } from "@/components/agent/timeline";
import { agentPosture, autoExecuteTerms } from "@/lib/agent/posture";
import type { AgentLedgerEntry } from "@/lib/agent/run-store";

type Catalog = { [key: string]: string | Catalog };
const leaves = (catalog: Catalog, prefix = ""): [string, string][] =>
  Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === "string" ? [[prefix + key, value]] : leaves(value, prefix + key + "."),
  );
const tPt = createTranslator({ locale: "pt-BR", messages: loadMessages("pt-BR").Agent as Record<string, string> });

describe("Phase 5B dictionaries and presentation-only fold", () => {
  for (const [name, en, pt] of [
    ["Agent", enAgent, ptAgent],
    ["QuerySafety", enSafety, ptSafety],
  ] as const) {
    test(`${name}: equal keys, types and valid ICU in both locales`, () => {
      expect(
        leaves(pt)
          .map(([key]) => key)
          .sort(),
      ).toEqual(
        leaves(en)
          .map(([key]) => key)
          .sort(),
      );
      for (const [, value] of [...leaves(en), ...leaves(pt)]) {
        expect(value.trim()).not.toBe("");
        expect(() => parse(value)).not.toThrow();
      }
    });
  }

  for (const locale of ["en", "pt-BR"]) {
    for (const filename of ["agent", "query-safety"]) {
      test(`${locale}/${filename}: no duplicate JSON keys`, () => {
        const source = ts.parseJsonText("messages.json", readFileSync(`messages/${locale}/${filename}.json`, "utf8"));
        function visit(node: ts.Node) {
          if (ts.isObjectLiteralExpression(node)) {
            const keys = node.properties.map((property) => property.name?.getText(source));
            expect(new Set(keys).size).toBe(keys.length);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      });
    }
  }

  test("English remains the reference and nested fallback is preserved", () => {
    const en = loadMessages("en");
    expect(en.Agent).toEqual(enAgent);
    expect(en.QuerySafety).toEqual(enSafety);
    expect(loadMessages("pt-BR").Agent).toEqual(ptAgent);
    expect(loadMessages("pt-BR").QuerySafety).toEqual(ptSafety);
    const merged = mergeMessages(en, {
      QuerySafety: { risk: { critical: "Risco crítico" } },
      Agent: { stop: "Parar" },
    });
    expect(merged.QuerySafety.risk.critical).toBe("Risco crítico");
    expect(merged.QuerySafety.risk.safe).toBe(enSafety.risk.safe);
    expect(merged.Agent.stop).toBe("Parar");
    expect(merged.Agent.handoverTerms).toBe(enAgent.handoverTerms);
  });

  test("fold changes only display: no ledger, SQL, status, budget or model-content mutation", () => {
    const sql = "DELETE FROM customers;";
    const prose = '**Keep this Markdown**\n```json\n{"customer_id":7}\n```';
    const raw = "Missing environment variable LLM_API_KEY";
    const entries = [
      {
        kind: "run-opened",
        atMs: 1,
        runId: "r",
        mode: "agent",
        objective: "User input stays English.",
        connectionId: "seed:test",
        actor: { sessionId: "test", role: "user" },
      },
      { kind: "event", event: { kind: "context-captured", atMs: 2, fingerprint: "schema_1234", tableCount: 1 } },
      {
        kind: "event",
        event: { kind: "statement-drafted", atMs: 3, stepId: "s", sql, rationale: "Raw model rationale." },
      },
      {
        kind: "event",
        event: {
          kind: "tool-refused",
          atMs: 4,
          stepId: "s",
          refusal: { class: "database-error", message: raw, statementFingerprint: "sql_1234" },
        },
      },
      { kind: "event", event: { kind: "closing-statement", atMs: 5, text: prose } },
      { kind: "event", event: { kind: "run-finished", atMs: 6, status: "failed", reason: "model-unavailable" } },
    ] as AgentLedgerEntry[];
    const before = JSON.stringify(entries);
    const english = foldLedgerEntries(entries);
    const portuguese = foldLedgerEntries(entries, tPt);
    const dataOnly = (value: unknown): unknown =>
      JSON.parse(
        JSON.stringify(value, (key, item) =>
          ["headline", "detail", "label", "shortLabel"].includes(key) ? undefined : item,
        ),
      );
    expect(dataOnly(portuguese)).toEqual(dataOnly(english));
    expect(portuguese.items[0].quoted).toBe("User input stays English.");
    expect(portuguese.items[2].quoted).toBe(sql);
    expect(portuguese.items[2].detail).toBe("Raw model rationale.");
    expect(portuguese.items[3].quoted).toBe(raw);
    expect(portuguese.items[4].prose).toBe(prose);
    expect(portuguese.status).toBe("failed");
    expect(portuguese.items[1].detail).toContain("1 tabela");
    expect(portuguese.items[0].headline).not.toBe(english.items[0].headline);
    expect(JSON.stringify(entries)).toBe(before);
  });

  test("posture keeps the same tone and derived bounds for all mode/engine/consent combinations", () => {
    for (const mode of ["planning", "agent"] as const) {
      for (const engine of [null, "postgres", "mysql", "sqlite", "duckdb"] as const) {
        for (const handover of [false, true]) {
          const input = { mode, engine, engineLabel: "Technical provider name", handover };
          const en = agentPosture(input);
          const pt = agentPosture(input, tPt);
          expect(pt.tone).toBe(en.tone);
          expect(pt.body).not.toBe(en.body);
          const numbers = (text: string) => text.match(/\d+/g) ?? [];
          expect(numbers(pt.body)).toEqual(numbers(en.body));
        }
      }
    }
    expect(autoExecuteTerms("data-analysis", tPt)).toContain("DDL");
    expect(
      agentPosture({ mode: "agent", engine: "postgres", engineLabel: "PostgreSQL", handover: true }, tPt).body,
    ).toBe(autoExecuteTerms("investigation", tPt));
  });
});
