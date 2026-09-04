import { SHIPPED_DATABASE_TYPES } from "@/lib/db/compatibility";
import type { DatabaseType } from "@/lib/types";

/**
 * Providers shown by this fork when no explicit UI allowlist is configured.
 *
 * This is deliberately a presentation policy only. The provider registry, factory,
 * capabilities and persisted connections continue to support every shipped type.
 */
export const DEFAULT_ENABLED_DATABASE_TYPES = [
  "postgres",
  "mysql",
  "sqlite",
] as const satisfies readonly DatabaseType[];

const SHIPPED_DATABASE_TYPE_SET = new Set<DatabaseType>(SHIPPED_DATABASE_TYPES);

export function resolveEnabledDatabaseTypes(configured: string | undefined): readonly DatabaseType[] {
  if (!configured?.trim()) return DEFAULT_ENABLED_DATABASE_TYPES;

  const enabled = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is DatabaseType => SHIPPED_DATABASE_TYPE_SET.has(value as DatabaseType));

  return enabled.length > 0 ? [...new Set(enabled)] : DEFAULT_ENABLED_DATABASE_TYPES;
}

function configuredDatabaseTypes(): readonly DatabaseType[] {
  return resolveEnabledDatabaseTypes(process.env.NEXT_PUBLIC_ENABLED_DATABASE_TYPES);
}

/** Returns the UI allowlist, optionally retaining types required by the current context. */
export function getEnabledDatabaseTypes(additionalTypes: readonly DatabaseType[] = []): DatabaseType[] {
  return [...new Set([...configuredDatabaseTypes(), ...additionalTypes])];
}

export function isDatabaseTypeEnabled(type: DatabaseType): boolean {
  return configuredDatabaseTypes().includes(type);
}

export function filterEnabledDatabaseTypes(types: readonly DatabaseType[]): DatabaseType[] {
  const enabled = new Set(configuredDatabaseTypes());
  return types.filter((type) => enabled.has(type));
}

/**
 * Filters a presentation list without mutating or deleting the persisted source.
 */
export function filterEnabledDatabaseConnections<T extends { type: DatabaseType }>(connections: readonly T[]): T[] {
  const enabled = new Set(configuredDatabaseTypes());
  return connections.filter((connection) => enabled.has(connection.type));
}
