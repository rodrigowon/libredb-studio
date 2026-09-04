import enCommon from "../../messages/en/common.json";
import enLogin from "../../messages/en/login.json";
import enMetadata from "../../messages/en/metadata.json";
import ptBrCommon from "../../messages/pt-BR/common.json";
import ptBrLogin from "../../messages/pt-BR/login.json";
import ptBrMetadata from "../../messages/pt-BR/metadata.json";
import { FALLBACK_LOCALE, type Locale } from "@/i18n/config";

type MessageObject = { [key: string]: string | MessageObject };
type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends object ? DeepPartial<T[Key]> : T[Key];
};

const englishMessages = {
  Common: enCommon,
  Metadata: enMetadata,
  Login: enLogin,
};

const portugueseMessages = {
  Common: ptBrCommon,
  Metadata: ptBrMetadata,
  Login: ptBrLogin,
};

export type AppMessages = typeof englishMessages;

export function mergeMessages<T extends MessageObject>(fallback: T, override: DeepPartial<T>): T {
  const result = { ...fallback } as MessageObject;

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;

    const fallbackValue = fallback[key];
    if (typeof value === "object" && value !== null && typeof fallbackValue === "object") {
      result[key] = mergeMessages(fallbackValue, value as DeepPartial<typeof fallbackValue>);
    } else {
      result[key] = value as string;
    }
  }

  return result as T;
}

export function loadMessages(locale: Locale): AppMessages {
  if (locale === FALLBACK_LOCALE) return englishMessages;
  return mergeMessages(englishMessages, portugueseMessages);
}
