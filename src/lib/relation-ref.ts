import type { RelationRef } from "./types";

export type NormalizedRelationIdentity =
  | { status: "resolved"; ref: RelationRef; legacyName: string }
  | { status: "legacy"; legacyName: string };

function isRelationRef(ref: unknown): ref is RelationRef {
  if (typeof ref !== "object" || ref === null || Array.isArray(ref)) return false;
  return (
    "name" in ref &&
    typeof ref.name === "string" &&
    "namespace" in ref &&
    (ref.namespace === null || typeof ref.namespace === "string")
  );
}

/** Only explicit, structurally valid metadata resolves identity; legacy names are opaque. */
export function normalizeRelationIdentity(relation: { name: string; ref?: unknown }): NormalizedRelationIdentity {
  if (!isRelationRef(relation.ref)) return { status: "legacy", legacyName: relation.name };
  return {
    status: "resolved",
    ref: { namespace: relation.ref.namespace, name: relation.ref.name },
    legacyName: relation.name,
  };
}

/** Collision-free tuple encoding within one scope, not SQL qualification or a global ID. */
export function relationRefKey(ref: RelationRef): string {
  return JSON.stringify([ref.namespace, ref.name]);
}
