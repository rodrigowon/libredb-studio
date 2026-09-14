import type { DialectAdapter } from "./types";
export const mysqlAdapter: DialectAdapter = {
  dialect: "mysql",
  modifyingCte: false,
  unsupportedVerbs: ["PRAGMA", "ATTACH", "DETACH", "VACUUM", "REINDEX", "EXEC"],
};
