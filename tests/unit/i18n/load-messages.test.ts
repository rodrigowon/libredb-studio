import { describe, expect, test } from "bun:test";
import enCommon from "../../../messages/en/common.json";
import enLogin from "../../../messages/en/login.json";
import enMetadata from "../../../messages/en/metadata.json";
import ptBrCommon from "../../../messages/pt-BR/common.json";
import ptBrLogin from "../../../messages/pt-BR/login.json";
import ptBrMetadata from "../../../messages/pt-BR/metadata.json";
import { loadMessages, mergeMessages } from "@/i18n/load-messages";

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

describe("i18n message loading", () => {
  test("loads the complete English reference catalog", () => {
    const messages = loadMessages("en");
    expect(messages.Common).toEqual(enCommon);
    expect(messages.Metadata).toEqual(enMetadata);
    expect(messages.Login).toEqual(enLogin);
  });

  test("overrides English with Brazilian Portuguese", () => {
    const messages = loadMessages("pt-BR");
    expect(messages.Login.form.submit).toBe("Entrar");
    expect(messages.Metadata.title).toBe("LibreDB Studio | Editor universal de bancos de dados");
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
  });
});
