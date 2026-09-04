import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ENABLED_DATABASE_TYPES,
  filterEnabledDatabaseConnections,
  filterEnabledDatabaseTypes,
  getEnabledDatabaseTypes,
  resolveEnabledDatabaseTypes,
} from "@/lib/database-visibility";
import type { DatabaseConnection } from "@/lib/types";

describe("database visibility", () => {
  test("defaults exactly to PostgreSQL, MySQL and SQLite", () => {
    expect(DEFAULT_ENABLED_DATABASE_TYPES).toEqual(["postgres", "mysql", "sqlite"]);
    expect(resolveEnabledDatabaseTypes(undefined)).toEqual(["postgres", "mysql", "sqlite"]);
  });

  test("accepts a comma-separated override, ignores unknown ids and removes duplicates", () => {
    expect(resolveEnabledDatabaseTypes(" mysql, oracle,unknown,MYSQL ")).toEqual(["mysql", "oracle"]);
  });

  test("falls back to the safe default when an override has no valid provider", () => {
    expect(resolveEnabledDatabaseTypes("unknown,also-unknown")).toEqual(["postgres", "mysql", "sqlite"]);
  });

  test("can retain a hidden type required by an edit context", () => {
    expect(getEnabledDatabaseTypes(["oracle"])).toEqual(["postgres", "mysql", "sqlite", "oracle"]);
  });

  test("filters presentation lists without mutating persisted connection data", () => {
    const visible: DatabaseConnection = {
      id: "pg",
      name: "Postgres",
      type: "postgres",
      createdAt: new Date(),
    };
    const hidden: DatabaseConnection = {
      id: "oracle",
      name: "Legacy Oracle",
      type: "oracle",
      createdAt: new Date(),
    };
    const persisted = [visible, hidden];

    expect(filterEnabledDatabaseTypes(["oracle", "sqlite", "postgres"])).toEqual(["sqlite", "postgres"]);
    expect(filterEnabledDatabaseConnections(persisted)).toEqual([visible]);
    expect(persisted).toEqual([visible, hidden]);
  });
});
