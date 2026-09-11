import { describe, test, expect } from "bun:test";
import { getExplainStrategy } from "@/lib/explain";

describe("getExplainStrategy", () => {
  test("resolves measured text formats and refuses unknown/inherited keys", () => {
    for (const format of ["postgres-text", "postgres-text-analyze", "mysql-text"] as const) {
      expect(getExplainStrategy(format)?.format).toBe(format);
    }
    expect(getExplainStrategy("constructor")).toBeNull();
    expect(getExplainStrategy("unknown")).toBeNull();
  });
  test("resolves postgres-json", () => {
    expect(getExplainStrategy("postgres-json")?.format).toBe("postgres-json");
  });

  test("resolves mysql-json", () => {
    expect(getExplainStrategy("mysql-json")?.format).toBe("mysql-json");
  });

  test("returns null for undefined (provider without explain support)", () => {
    expect(getExplainStrategy(undefined)).toBeNull();
  });
});
