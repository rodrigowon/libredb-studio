import { createTranslator } from "next-intl";
import messages from "../../messages/en/agent.json";

/** Presentation helpers keep their English output unless a UI supplies its translator.
 * No locale is read from ambient state; runtime decisions and payloads never use this.
 */
export type AgentTranslator = (key: string, values?: Record<string, string | number>) => string;
const english = createTranslator({ locale: "en", messages });
export const englishAgentTranslator: AgentTranslator = (key, values) => english(key as keyof typeof messages, values);

/** Known presentation vocabulary only. Unknown provider labels pass through;
 * database identifiers and persisted inventory objects never enter this helper.
 */
const INVENTORY_LABELS: Readonly<Record<string, string>> = {
  table: "nounTable",
  tables: "nounTables",
  collection: "nounCollection",
  collections: "nounCollections",
  datasource: "nounDatasource",
  datasources: "nounDatasources",
  "key pattern": "nounKeyPattern",
  "key patterns": "nounKeyPatterns",
  "key prefix": "nounKeyPrefix",
  "key prefixes": "nounKeyPrefixes",
};
export const agentInventoryLabel = (label: string, t: AgentTranslator): string =>
  Object.hasOwn(INVENTORY_LABELS, label) ? t(INVENTORY_LABELS[label]) : label;
