import type { DialectAdapter } from "./types";
export const sqliteAdapter: DialectAdapter = {
  dialect: "sqlite",
  modifyingCte: false,
  unsupportedVerbs: ["TRUNCATE", "GRANT", "REVOKE", "CALL", "DO", "EXEC", "EXECUTE", "SET", "START"],
};
