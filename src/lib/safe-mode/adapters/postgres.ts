import type { DialectAdapter } from "./types";
export const postgresAdapter: DialectAdapter = {
  dialect: "postgres",
  modifyingCte: true,
  unsupportedVerbs: ["PRAGMA", "ATTACH", "DETACH", "REPLACE", "EXEC"],
};
