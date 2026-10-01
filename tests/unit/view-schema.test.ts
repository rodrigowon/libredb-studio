import { expect, test } from "bun:test";
import type { ViewSchema as PublicViewSchema, TableSchema } from "@/exports/types";
import type { StudioWorkspaceProps } from "@/exports/workspace";

const view: PublicViewSchema = {
  name: "a.b",
  ref: { namespace: "public", name: "a.b" },
  columns: [{ name: "value", type: "integer", nullable: true, isPrimary: false }],
};
// @ts-expect-error New view producers must provide structured identity.
const missingRef: PublicViewSchema = { name: "legacy", columns: [] };
const legacyTable: TableSchema = { name: "legacy", columns: [], indexes: [] };
const oldHost: StudioWorkspaceProps = {
  connections: [],
  onSchemaFetch: async () => [legacyTable],
  onQueryExecute: async () => ({ rows: [], fields: [], rowCount: 0, executionTime: 0 }),
};
const newHost: StudioWorkspaceProps = { ...oldHost, onViewsFetch: async () => [view] };

test("public views contract is additive for hosts, with required view identity", async () => {
  expect(oldHost.onViewsFetch).toBeUndefined();
  expect(await oldHost.onSchemaFetch("id")).toEqual([legacyTable]);
  expect(await newHost.onViewsFetch!("id")).toEqual([view]);
  expect(Object.hasOwn(missingRef, "ref")).toBe(false);
  expect(Object.keys(view).sort()).toEqual(["columns", "name", "ref"]);
});
