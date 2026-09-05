import { describe, expect, test } from "bun:test";
import { createTranslator } from "next-intl";
import enCommon from "../../../messages/en/common.json";
import enLogin from "../../../messages/en/login.json";
import enMetadata from "../../../messages/en/metadata.json";
import enStudio from "../../../messages/en/studio.json";
import enConnections from "../../../messages/en/connections.json";
import enEditor from "../../../messages/en/editor.json";
import enResults from "../../../messages/en/results.json";
import enHistory from "../../../messages/en/history.json";
import enDataTools from "../../../messages/en/data-tools.json";
import enDocs from "../../../messages/en/docs.json";
import enSchemaDiff from "../../../messages/en/schema-diff.json";
import ptBrCommon from "../../../messages/pt-BR/common.json";
import ptBrLogin from "../../../messages/pt-BR/login.json";
import ptBrMetadata from "../../../messages/pt-BR/metadata.json";
import ptBrStudio from "../../../messages/pt-BR/studio.json";
import ptBrConnections from "../../../messages/pt-BR/connections.json";
import ptBrEditor from "../../../messages/pt-BR/editor.json";
import ptBrResults from "../../../messages/pt-BR/results.json";
import ptBrHistory from "../../../messages/pt-BR/history.json";
import ptBrDataTools from "../../../messages/pt-BR/data-tools.json";
import ptBrDocs from "../../../messages/pt-BR/docs.json";
import ptBrSchemaDiff from "../../../messages/pt-BR/schema-diff.json";
import { loadMessages, mergeMessages } from "@/i18n/load-messages";
import enAdmin from "../../../messages/en/admin.json";
import ptBrAdmin from "../../../messages/pt-BR/admin.json";
import enMonitoring from "../../../messages/en/monitoring.json";
import ptBrMonitoring from "../../../messages/pt-BR/monitoring.json";

type JsonObject = { [key: string]: string | JsonObject };

function expectValidOverride(reference: JsonObject, override: JsonObject): void {
  for (const [key, value] of Object.entries(override)) {
    expect(reference).toHaveProperty(key);
    expect(typeof value).toBe(typeof reference[key]);
    if (typeof value === "string") {
      expect(value.trim().length).toBeGreaterThan(0);
    } else {
      expectValidOverride(reference[key] as JsonObject, value);
    }
  }
}

function messageKeys(catalog: JsonObject, prefix = ""): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : messageKeys(value, path);
  });
}

describe("i18n message loading", () => {
  test("Phase 4 catalogs have equivalent keys, types and non-empty translations", () => {
    for (const [english, portuguese] of [[enAdmin, ptBrAdmin], [enMonitoring, ptBrMonitoring]]) {
      expect(messageKeys(portuguese).sort()).toEqual(messageKeys(english).sort());
      expectValidOverride(english, portuguese);
    }
    expect(loadMessages("en").Admin).toEqual(enAdmin);
    expect(loadMessages("en").Monitoring).toEqual(enMonitoring);
    expect(loadMessages("pt-BR").Admin).toEqual(ptBrAdmin);
    expect(loadMessages("pt-BR").Monitoring).toEqual(ptBrMonitoring);
  });

  test("Phase 4 nested messages fall back to English without mutating the reference", () => {
    const merged = mergeMessages(enAdmin, { operations: { tables: ptBrAdmin.operations.tables } });
    expect(merged.operations.tables).toBe("Tabelas");
    expect(merged.operations.confirmSession).toBe(enAdmin.operations.confirmSession);
    expect(enAdmin.operations.tables).toBe("Tables");
  });

  test("Phase 3 Portuguese counts use plural for zero and preserve singular for one", () => {
    const t = createTranslator({ locale: "pt-BR", messages: loadMessages("pt-BR") });
    expect(t("History.history.showing", { count: 0 })).toBe("Exibindo 0 execuções");
    expect(t("History.history.showing", { count: 1 })).toBe("Exibindo 1 execução");
    expect(t("History.history.showing", { count: 2 })).toBe("Exibindo 2 execuções");
    expect(t("Results.stats.rows", { count: 0 })).toBe("0 linhas");
    expect(t("Results.stats.rows", { count: 1 })).toBe("1 linha");
    expect(t("Results.stats.columns", { count: 0 })).toBe("0 colunas");
    expect(t("Results.export.writesAll", { count: 0 })).toBe("Exporta todas as 0 linhas.");
    expect(t("Docs.tableCount", { count: 0 })).toBe("0 tabelas");
    expect(t("SchemaDiff.timeline.tables", { count: 0 })).toBe("0 tabelas");
    expect(t("DataTools.pivot.summary", { groups: 0, columns: 0, aggregation: "COUNT" })).toBe(
      "0 grupos • 0 colunas • agregação COUNT",
    );
  });

  test("loads the complete English reference catalog", () => {
    const messages = loadMessages("en");
    expect(messages.Common).toEqual(enCommon);
    expect(messages.Metadata).toEqual(enMetadata);
    expect(messages.Login).toEqual(enLogin);
    expect(messages.Studio).toEqual(enStudio);
    expect(messages.Connections).toEqual(enConnections);
    expect(messages.Editor).toEqual(enEditor);
    expect(messages.Results).toEqual(enResults);
    expect(messages.History).toEqual(enHistory);
    expect(messages.DataTools).toEqual(enDataTools);
    expect(messages.Docs).toEqual(enDocs);
    expect(messages.SchemaDiff).toEqual(enSchemaDiff);
  });

  test("overrides English with Brazilian Portuguese", () => {
    const messages = loadMessages("pt-BR");
    expect(messages.Login.form.submit).toBe("Entrar");
    expect(messages.Metadata.title).toBe("LibreDB Studio | Editor universal de bancos de dados");
    expect(messages.Studio.navigation.results).toBe("Resultados");
    expect(messages.Connections.modal.newTitle).toBe("Nova conexão");
    expect(messages.Editor.toolbar.run).toBe("Executar");
    expect(messages.Results.empty.title).toBe("A consulta não retornou dados");
    expect(messages.History.saved.title).toBe("Consultas salvas");
    expect(messages.DataTools.pivot.title).toBe("Tabela dinâmica");
    expect(messages.Docs.title).toBe("Documentação do banco");
    expect(messages.SchemaDiff.title).toBe("Comparação de Schema");
  });

  test("falls back to English for a key missing from pt-BR", () => {
    const messages = loadMessages("pt-BR");
    expect(ptBrCommon.actions).not.toHaveProperty("close");
    expect(messages.Common.actions.close).toBe("Close");
  });

  test("deep-merges nested catalogs without mutating the fallback", () => {
    const fallback = { section: { first: "First", second: "Second" } };
    const result = mergeMessages(fallback, { section: { first: "Primeiro" } });
    expect(result).toEqual({ section: { first: "Primeiro", second: "Second" } });
    expect(fallback).toEqual({ section: { first: "First", second: "Second" } });
  });

  test("Portuguese catalogs contain only non-empty keys from the English reference", () => {
    expectValidOverride(enCommon as JsonObject, ptBrCommon as JsonObject);
    expectValidOverride(enMetadata as JsonObject, ptBrMetadata as JsonObject);
    expectValidOverride(enLogin as JsonObject, ptBrLogin as JsonObject);
    expectValidOverride(enStudio as JsonObject, ptBrStudio as JsonObject);
    expectValidOverride(enConnections as JsonObject, ptBrConnections as JsonObject);
    expectValidOverride(enEditor as JsonObject, ptBrEditor as JsonObject);
    expectValidOverride(enResults as JsonObject, ptBrResults as JsonObject);
    expectValidOverride(enHistory as JsonObject, ptBrHistory as JsonObject);
    expectValidOverride(enDataTools as JsonObject, ptBrDataTools as JsonObject);
    expectValidOverride(enDocs as JsonObject, ptBrDocs as JsonObject);
    expectValidOverride(enSchemaDiff as JsonObject, ptBrSchemaDiff as JsonObject);
  });

  test("Phase 3 catalogs have equivalent English and Portuguese structures", () => {
    for (const [english, portuguese] of [
      [enResults, ptBrResults],
      [enHistory, ptBrHistory],
      [enDataTools, ptBrDataTools],
      [enDocs, ptBrDocs],
      [enSchemaDiff, ptBrSchemaDiff],
    ] as const) {
      expect(messageKeys(portuguese as JsonObject).sort()).toEqual(messageKeys(english as JsonObject).sort());
    }
  });
});
