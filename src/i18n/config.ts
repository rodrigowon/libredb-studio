export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";
export const FALLBACK_LOCALE: Locale = "en";
export const LOCALE_COOKIE_NAME = "libredb_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(cookieValue: string | undefined): Locale {
  return isSupportedLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
}
