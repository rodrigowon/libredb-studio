import type { SqlDialect } from "../types";

export interface DialectAdapter {
  dialect: SqlDialect;
  modifyingCte: boolean;
  unsupportedVerbs: readonly string[];
}
