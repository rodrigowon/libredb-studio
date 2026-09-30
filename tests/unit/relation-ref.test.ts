import { describe, expect, test } from "bun:test";
import type { RelationRef, SchemaSnapshot, TableSchema } from "@/exports/types";
import { normalizeRelationIdentity, relationRefKey } from "@/lib/relation-ref";
import type { StudioWorkspaceProps } from "@/workspace/types";

describe("normalizeRelationIdentity", () => {
  test("explicit structured identity takes precedence over the opaque legacy name", () => {
    const ref: RelationRef = { namespace: "inventory", name: "products" };
    expect(normalizeRelationIdentity({ name: "different.legacy.name", ref })).toEqual({
      status: "resolved",
      ref,
      legacyName: "different.legacy.name",
    });
  });

  test.each(["a.b", '"a"."b"', "MixedCase", " SELECT ", "客户.库存"])(
    "legacy name %s stays opaque without namespace inference",
    (name) => {
      expect(normalizeRelationIdentity({ name })).toEqual({ status: "legacy", legacyName: name });
    },
  );

  test.each([
    { namespace: "a", name: "b.c" },
    { namespace: "a.b", name: "c" },
    { namespace: " spaced namespace ", name: " spaced name " },
    { namespace: '"schema"', name: "a\"b`c'd" },
    { namespace: "库存", name: "café_🍎" },
    { namespace: "cafe\u0301", name: "cafe\u0301" },
    { namespace: "MixedCase", name: "MixedTable" },
    { namespace: "SELECT", name: "ORDER" },
    { namespace: null, name: "literal.table" },
    { namespace: "", name: "" },
  ] satisfies RelationRef[])("preserves raw structured identity %j", (ref) => {
    expect(normalizeRelationIdentity({ name: "legacy", ref })).toEqual({
      status: "resolved",
      ref,
      legacyName: "legacy",
    });
    expect(JSON.parse(relationRefKey(ref))).toEqual([ref.namespace, ref.name]);
  });

  test.each(
    [
      undefined,
      null,
      "a.b",
      42,
      [],
      {},
      { namespace: null },
      { namespace: null, name: 42 },
      { name: "table" },
      { namespace: undefined, name: "table" },
      { namespace: 42, name: "table" },
    ].map((ref) => ({ ref })),
  )("invalid ref %j leaves the legacy name untouched", ({ ref }) => {
    expect(normalizeRelationIdentity({ name: "a.b", ref })).toEqual({ status: "legacy", legacyName: "a.b" });
  });

  test("normalization does not mutate the input or share its ref object", () => {
    const ref = Object.freeze({ namespace: null, name: " table " });
    const relation = Object.freeze({ name: "legacy", ref });
    const normalized = normalizeRelationIdentity(relation);
    expect(normalized).toEqual({ status: "resolved", ref, legacyName: "legacy" });
    if (normalized.status === "resolved") expect(normalized.ref).not.toBe(ref);
    expect(relation).toEqual({ name: "legacy", ref });
  });

  test("legacy public contracts remain compatible with embedded hosts and snapshots", async () => {
    const legacyTable: TableSchema = { name: "a.b", columns: [], indexes: [] };
    const host: Pick<StudioWorkspaceProps, "onSchemaFetch"> = {
      onSchemaFetch: async () => [legacyTable],
    };
    const schema: SchemaSnapshot["schema"] = await host.onSchemaFetch("test-scope");
    expect(schema).toEqual([legacyTable]);
    expect(normalizeRelationIdentity(schema[0])).toEqual({ status: "legacy", legacyName: "a.b" });
    expect(JSON.stringify(schema)).toBe('[{"name":"a.b","columns":[],"indexes":[]}]');
  });
});

describe("relationRefKey", () => {
  test("tuple encoding is deterministic and avoids dotted-name collisions", () => {
    const first = { namespace: "a", name: "b.c" };
    const second = { namespace: "a.b", name: "c" };
    expect(relationRefKey(first)).toBe('["a","b.c"]');
    expect(relationRefKey(first)).toBe(relationRefKey({ ...first }));
    expect(relationRefKey(first)).not.toBe(relationRefKey(second));
  });

  test("null, empty and literal null namespaces remain distinct", () => {
    const keys = [null, "", "null"].map((namespace) => relationRefKey({ namespace, name: "table" }));
    expect(new Set(keys).size).toBe(3);
  });

  test("does not fold case or normalize Unicode", () => {
    expect(relationRefKey({ namespace: null, name: "Users" })).not.toBe(
      relationRefKey({ namespace: null, name: "users" }),
    );
    expect(relationRefKey({ namespace: "café", name: "table" })).not.toBe(
      relationRefKey({ namespace: "cafe\u0301", name: "table" }),
    );
  });
});
