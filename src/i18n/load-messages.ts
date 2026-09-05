import enCommon from "../../messages/en/common.json";
import enLogin from "../../messages/en/login.json";
import enMetadata from "../../messages/en/metadata.json";
import enStudio from "../../messages/en/studio.json";
import enConnections from "../../messages/en/connections.json";
import enEditor from "../../messages/en/editor.json";
import enAdmin from "../../messages/en/admin.json";
import enMonitoring from "../../messages/en/monitoring.json";
import ptBrAdmin from "../../messages/pt-BR/admin.json";
import ptBrMonitoring from "../../messages/pt-BR/monitoring.json";
import enResults from "../../messages/en/results.json";
import enHistory from "../../messages/en/history.json";
import enDataTools from "../../messages/en/data-tools.json";
import enDocs from "../../messages/en/docs.json";
import enSchemaDiff from "../../messages/en/schema-diff.json";
import ptBrCommon from "../../messages/pt-BR/common.json";
import ptBrLogin from "../../messages/pt-BR/login.json";
import ptBrMetadata from "../../messages/pt-BR/metadata.json";
import ptBrStudio from "../../messages/pt-BR/studio.json";
import ptBrConnections from "../../messages/pt-BR/connections.json";
import ptBrEditor from "../../messages/pt-BR/editor.json";
import ptBrResults from "../../messages/pt-BR/results.json";
import ptBrHistory from "../../messages/pt-BR/history.json";
import ptBrDataTools from "../../messages/pt-BR/data-tools.json";
import ptBrDocs from "../../messages/pt-BR/docs.json";
import ptBrSchemaDiff from "../../messages/pt-BR/schema-diff.json";
import { FALLBACK_LOCALE, type Locale } from "@/i18n/config";

type MessageObject = { [key: string]: string | MessageObject };
type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends object ? DeepPartial<T[Key]> : T[Key];
};

const englishMessages = {
  Common: enCommon,
  Metadata: enMetadata,
  Login: enLogin,
  Studio: enStudio,
  Connections: enConnections,
  Editor: enEditor,
  Admin: enAdmin,
  Monitoring: enMonitoring,
  Results: enResults,
  History: enHistory,
  DataTools: enDataTools,
  Docs: enDocs,
  SchemaDiff: enSchemaDiff,
};

const portugueseMessages = {
  Common: ptBrCommon,
  Metadata: ptBrMetadata,
  Login: ptBrLogin,
  Studio: ptBrStudio,
  Connections: ptBrConnections,
  Editor: ptBrEditor,
  Admin: ptBrAdmin,
  Monitoring: ptBrMonitoring,
  Results: ptBrResults,
  History: ptBrHistory,
  DataTools: ptBrDataTools,
  Docs: ptBrDocs,
  SchemaDiff: ptBrSchemaDiff,
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
