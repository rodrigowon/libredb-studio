import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  resolveLocale,
} from "@/i18n/config";

describe("i18n locale configuration", () => {
  test("defines the fork's locale contract centrally", () => {
    expect(SUPPORTED_LOCALES).toEqual(["pt-BR", "en"]);
    expect(DEFAULT_LOCALE).toBe("pt-BR");
    expect(FALLBACK_LOCALE).toBe("en");
    expect(LOCALE_COOKIE_NAME).toBe("libredb_locale");
    expect(LOCALE_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 365);
  });

  test("recognizes only the supported locale identifiers", () => {
    expect(isSupportedLocale("pt-BR")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("pt-br")).toBe(false);
    expect(isSupportedLocale("en-US")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });

  test("uses pt-BR when the cookie is absent", () => {
    expect(resolveLocale(undefined)).toBe("pt-BR");
  });

  test("uses pt-BR when the cookie explicitly selects pt-BR", () => {
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
  });

  test("uses en when the cookie explicitly selects en", () => {
    expect(resolveLocale("en")).toBe("en");
  });

  test("uses pt-BR when the cookie is invalid", () => {
    expect(resolveLocale("es")).toBe("pt-BR");
  });
});
