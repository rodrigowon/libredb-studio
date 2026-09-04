"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  GitCompare,
  Plus,
  Minus,
  PenLine,
  Camera,
  FileCode,
  ChevronRight,
  ChevronDown,
  Clock,
  Database,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TableSchema, SchemaSnapshot, DatabaseType, DatabaseConnection } from "@/lib/types";
import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { useAllConnections } from "@/hooks/use-all-connections";
import { diffSchemas } from "@/lib/schema-diff/diff-engine";
import { generateMigrationSQL } from "@/lib/schema-diff/migration-generator";
import type { SchemaDiff as SchemaDiffType, TableDiff } from "@/lib/schema-diff/types";
import { SnapshotTimeline } from "@/components/SnapshotTimeline";
import { useFormatter, useTranslations } from "next-intl";

interface SchemaDiffProps {
  schema: TableSchema[];
  connection: DatabaseConnection | null;
}

export function SchemaDiff({ schema, connection }: SchemaDiffProps) {
  const t = useTranslations("SchemaDiff");
  const format = useFormatter();
  const [snapshots, setSnapshots] = useState<SchemaSnapshot[]>(() => storage.getSchemaSnapshots());
  const [sourceId, setSourceId] = useState<string>("current");
  const [targetId, setTargetId] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [showLabelInput, setShowLabelInput] = useState(false);

  // Take snapshot of current schema
  const takeSnapshot = useCallback(() => {
    if (!connection) return;
    const snapshot: SchemaSnapshot = {
      id: Date.now().toString(),
      connectionId: connection.id,
      connectionName: connection.name,
      databaseType: connection.type,
      schema: JSON.parse(JSON.stringify(schema)),
      createdAt: new Date(),
      label: snapshotLabel.trim() || undefined,
    };
    storage.saveSchemaSnapshot(snapshot);
    setSnapshots(storage.getSchemaSnapshots());
    setSnapshotLabel("");
    setShowLabelInput(false);
  }, [schema, connection, snapshotLabel]);

  // Delete snapshot
  const deleteSnapshot = useCallback(
    (id: string) => {
      storage.deleteSchemaSnapshot(id);
      setSnapshots(storage.getSchemaSnapshots());
      if (sourceId === id) setSourceId("current");
      if (targetId === id) setTargetId("");
    },
    [sourceId, targetId],
  );

  // Compute diff
  const diff = useMemo<SchemaDiffType | null>(() => {
    if (!targetId) return null;

    const sourceSchema = sourceId === "current" ? schema : snapshots.find((s) => s.id === sourceId)?.schema || [];

    const targetSchema = targetId === "current" ? schema : snapshots.find((s) => s.id === targetId)?.schema || [];

    if (sourceId === targetId) return null;

    return diffSchemas(sourceSchema, targetSchema);
  }, [sourceId, targetId, schema, snapshots]);

  // Generate migration SQL
  const migrationSQL = useMemo(() => {
    if (!diff || !diff.hasChanges) return "";
    const dialect = connection?.type || "postgres";
    return generateMigrationSQL(diff, dialect as DatabaseType);
  }, [diff, connection]);

  // Get all connections for cross-connection comparison
  const { connections: allConnections } = useAllConnections();
  const [fetchingRemote, setFetchingRemote] = useState(false);

  // Fetch schema from a remote connection
  const fetchRemoteSchema = useCallback(
    async (connId: string) => {
      const conn = allConnections.find((c) => c.id === connId);
      if (!conn) return;

      setFetchingRemote(true);
      try {
        const res = await fetch("/api/db/schema-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            conn.managed && conn.seedId ? { connectionId: `seed:${conn.seedId}` } : { connection: conn },
          ),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Auto-save as snapshot
        const snapshot: SchemaSnapshot = {
          id: `remote-${Date.now()}`,
          connectionId: conn.id,
          connectionName: conn.name,
          databaseType: conn.type,
          schema: data.schema,
          createdAt: new Date(),
          label: t("liveSnapshot", { name: conn.name }),
        };
        storage.saveSchemaSnapshot(snapshot);
        setSnapshots(storage.getSchemaSnapshots());
        setTargetId(snapshot.id);
      } catch (err) {
        logger.warn("Failed to fetch the remote schema for a diff", {
          route: "SchemaDiff",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setFetchingRemote(false);
      }
    },
    [allConnections, t],
  );

  const getActionBadge = (action: string) => {
    switch (action) {
      case "added":
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
            <Plus strokeWidth={1.5} className="w-2.5 h-2.5 mr-0.5" />
            {t("actions.added")}
          </Badge>
        );
      case "removed":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
            <Minus className="w-2.5 h-2.5 mr-0.5" />
            {t("actions.removed")}
          </Badge>
        );
      case "modified":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
            <PenLine strokeWidth={1.5} className="w-2.5 h-2.5 mr-0.5" />
            {t("actions.modified")}
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatSnapshotLabel = (s: SchemaSnapshot) => {
    const date = format.dateTime(new Date(s.createdAt), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${s.label || s.connectionName} (${date})`;
  };

  return (
    <div className="h-full flex flex-col bg-sunken">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hairline bg-surface flex-wrap">
        <GitCompare strokeWidth={1.5} className="w-3.5 h-3.5 text-rose-400" />
        <span className="text-xs font-medium text-fg-tertiary">{t("title")}</span>

        <div className="h-4 w-px bg-fill-strong" />

        {/* Source selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-fg-subtle">{t("source")}</span>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger className="h-7 w-[180px] text-xs bg-fill border-hairline-strong">
              <SelectValue placeholder={t("selectSource")} />
            </SelectTrigger>
            <SelectContent className="bg-overlay border-hairline-strong">
              <SelectItem value="current" className="text-xs">
                <div className="flex items-center gap-1">
                  <Database strokeWidth={1.5} className="w-3 h-3" /> {t("currentSchema")}
                </div>
              </SelectItem>
              {snapshots.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  <div className="flex items-center gap-1">
                    <Clock strokeWidth={1.5} className="w-3 h-3" /> {formatSnapshotLabel(s)}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-fg-subtle text-xs">{t("versus")}</span>

        {/* Target selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-fg-subtle">{t("target")}</span>
          <Select
            value={targetId}
            onValueChange={(v) => {
              if (v.startsWith("conn:")) {
                fetchRemoteSchema(v.replace("conn:", ""));
              } else {
                setTargetId(v);
              }
            }}
          >
            <SelectTrigger className="h-7 w-[180px] text-xs bg-fill border-hairline-strong">
              <SelectValue placeholder={t("selectTarget")} />
            </SelectTrigger>
            <SelectContent className="bg-overlay border-hairline-strong">
              <SelectItem value="current" className="text-xs">
                <div className="flex items-center gap-1">
                  <Database strokeWidth={1.5} className="w-3 h-3" /> {t("currentSchema")}
                </div>
              </SelectItem>
              {snapshots.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  <div className="flex items-center gap-1">
                    <Clock strokeWidth={1.5} className="w-3 h-3" /> {formatSnapshotLabel(s)}
                  </div>
                </SelectItem>
              ))}
              {allConnections.filter((c) => c.id !== connection?.id).length > 0 && (
                <>
                  <div className="px-2 py-1 text-[0.625rem] text-fg-subtle border-t border-hairline mt-1">
                    {t("fetchFromConnection")}
                  </div>
                  {allConnections
                    .filter((c) => c.id !== connection?.id)
                    .map((c) => (
                      <SelectItem key={`conn:${c.id}`} value={`conn:${c.id}`} className="text-xs">
                        <div className="flex items-center gap-1">
                          <Database strokeWidth={1.5} className="w-3 h-3 text-blue-400" /> {c.name}
                          {c.environment === "production" && (
                            <TriangleAlert strokeWidth={1.5} className="w-3 h-3 text-red-400" />
                          )}
                        </div>
                      </SelectItem>
                    ))}
                </>
              )}
            </SelectContent>
          </Select>
          {fetchingRemote && <span className="text-xs text-fg-muted animate-pulse">{t("fetching")}</span>}
        </div>

        <div className="flex-1" />

        {/* Snapshot controls */}
        {showLabelInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder={t("labelPlaceholder")}
              value={snapshotLabel}
              onChange={(e) => setSnapshotLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && takeSnapshot()}
              className="h-7 px-2 text-xs bg-fill border border-hairline-strong rounded text-fg-secondary focus:outline-none focus:border-blue-500 w-32"
              autoFocus
            />
            <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-400" onClick={takeSnapshot}>
              {t("save")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-fg-muted"
              onClick={() => setShowLabelInput(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-medium text-fg-muted hover:text-fg-bright gap-1"
            onClick={() => setShowLabelInput(true)}
            disabled={!connection}
          >
            <Camera className="w-3 h-3" /> {t("snapshot")}
          </Button>
        )}

        {diff?.hasChanges && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-medium text-fg-muted hover:text-fg-bright gap-1"
            onClick={() => setShowMigration(!showMigration)}
          >
            <FileCode className="w-3 h-3" /> {showMigration ? t("diffView") : t("sqlMigration")}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {!targetId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-fg-subtle gap-3">
            <GitCompare strokeWidth={1.5} className="w-10 h-10 opacity-30" />
            <p className="text-xs">{t("selectToCompare")}</p>
            <p className="text-xs text-fg-faint">{t("takeSnapshotHint")}</p>

            {/* Snapshot Timeline */}
            {snapshots.length > 0 && (
              <div className="mt-4 w-full max-w-2xl px-4">
                <SnapshotTimeline
                  snapshots={snapshots}
                  onCompare={(sourceId, targetId) => {
                    setSourceId(sourceId);
                    setTargetId(targetId);
                  }}
                  onDelete={deleteSnapshot}
                />
              </div>
            )}
          </div>
        ) : showMigration && migrationSQL ? (
          <div className="flex-1 overflow-auto p-4">
            <pre className="text-xs font-mono text-fg-secondary bg-raised border border-hairline-strong rounded-lg p-4 overflow-auto whitespace-pre-wrap">
              {migrationSQL}
            </pre>
          </div>
        ) : diff && diff.hasChanges ? (
          <>
            {/* Table List */}
            <div className="w-64 border-r border-hairline overflow-auto">
              <div className="p-2 border-b border-hairline">
                <div className="text-xs text-fg-muted px-2 mb-1">
                  {t("summary", {
                    added: diff.summary.added,
                    removed: diff.summary.removed,
                    modified: diff.summary.modified,
                  })}
                </div>
              </div>
              {diff.tables.map((table) => (
                <button
                  key={table.tableName}
                  onClick={() => setSelectedTable(table.tableName)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-fill transition-colors",
                    selectedTable === table.tableName && "bg-fill-strong",
                  )}
                >
                  {selectedTable === table.tableName ? (
                    <ChevronDown strokeWidth={1.5} className="w-3 h-3 text-fg-muted" />
                  ) : (
                    <ChevronRight strokeWidth={1.5} className="w-3 h-3 text-fg-muted" />
                  )}
                  <span className="text-fg-secondary">{table.tableName}</span>
                  <span className="ml-auto">{getActionBadge(table.action)}</span>
                </button>
              ))}
            </div>

            {/* Table Detail */}
            <div className="flex-1 overflow-auto p-4">
              {selectedTable ? (
                <TableDiffDetail diff={diff.tables.find((t) => t.tableName === selectedTable)!} />
              ) : (
                <div className="h-full flex items-center justify-center text-fg-subtle text-xs">
                  {t("selectTable")}
                </div>
              )}
            </div>
          </>
        ) : diff && !diff.hasChanges ? (
          <div className="flex-1 flex items-center justify-center text-fg-subtle gap-2">
            <span className="text-xs">{t("noDifferences")}</span>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-fg-subtle gap-2">
            <TriangleAlert strokeWidth={1.5} className="w-3.5 h-3.5" />
            <span className="text-xs">{t("sameSchema")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TableDiffDetail({ diff }: { diff: TableDiff }) {
  const t = useTranslations("SchemaDiff");
  const translateChange = (change: string) => {
    if (change.startsWith("Added column ")) return t("changes.addedColumn", { details: change.slice(13) });
    if (change.startsWith("Removed column ")) return t("changes.removedColumn", { details: change.slice(15) });
    if (change.startsWith("Type changed: ")) return t("changes.typeChanged", { details: change.slice(14) });
    if (change.startsWith("Nullable changed: ")) return t("changes.nullableChanged", { details: change.slice(18) });
    if (change.startsWith("Default changed: ")) return t("changes.defaultChanged", { details: change.slice(17) });
    if (change.startsWith("Primary key changed: ")) return t("changes.primaryChanged", { details: change.slice(21) });
    if (change.startsWith("Added index ")) return t("changes.addedIndex", { details: change.slice(12) });
    if (change.startsWith("Removed index ")) return t("changes.removedIndex", { details: change.slice(14) });
    if (change.startsWith("Columns changed")) return t("changes.columnsChanged", { details: change.slice(15) });
    if (change.startsWith("Unique changed: ")) return t("changes.uniqueChanged", { details: change.slice(16) });
    if (change.startsWith("Added FK")) return t("changes.addedForeignKey", { details: change.slice(8) });
    if (change.startsWith("Removed FK")) return t("changes.removedForeignKey", { details: change.slice(10) });
    return change;
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Database strokeWidth={1.5} className="w-3.5 h-3.5 text-fg-tertiary" />
        <h3 className="text-xs font-medium text-fg">{diff.tableName}</h3>
        <Badge
          className={cn(
            "text-xs",
            diff.action === "added" && "bg-green-500/20 text-green-400",
            diff.action === "removed" && "bg-red-500/20 text-red-400",
            diff.action === "modified" && "bg-yellow-500/20 text-yellow-400",
          )}
        >
          {t(`actions.${diff.action}`)}
        </Badge>
      </div>

      {/* Columns */}
      {diff.columns.length > 0 && (
        <div>
          <h4 className="text-xs text-fg-muted mb-2 font-medium">{t("sections.columns")}</h4>
          <div className="space-y-1">
            {/* Keyed by the name the row is ABOUT, not by its position: the diff is
                recomputed whenever either side changes, and the rows come back in a
                different order, which had React reusing one column's row for another's.
                The inner `changes` lists are keyed by their own text — each entry names a
                different attribute ("Type changed:", "Nullable changed:", …), so the text
                is unique within a row and survives a reorder the way the index did not. */}
            {diff.columns.map((col) => (
              <div
                key={col.columnName}
                className={cn(
                  "px-3 py-2 rounded text-xs flex items-center gap-2",
                  col.action === "added" && "bg-green-500/5 border border-green-500/10",
                  col.action === "removed" && "bg-red-500/5 border border-red-500/10",
                  col.action === "modified" && "bg-yellow-500/5 border border-yellow-500/10",
                )}
              >
                <span className="font-mono text-fg-secondary min-w-[120px]">{col.columnName}</span>
                {col.action === "modified" && (
                  <div className="flex flex-col gap-0.5">
                    {col.changes.map((change) => (
                      <span key={change} className="text-xs text-fg-muted">
                        {translateChange(change)}
                      </span>
                    ))}
                  </div>
                )}
                {col.action === "added" && <span className="text-xs text-green-400 font-mono">{col.targetType}</span>}
                {col.action === "removed" && <span className="text-xs text-red-400 font-mono">{col.sourceType}</span>}
                <span className="ml-auto">{getActionIcon(col.action)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indexes */}
      {diff.indexes.length > 0 && (
        <div>
          <h4 className="text-xs text-fg-muted mb-2 font-medium">{t("sections.indexes")}</h4>
          <div className="space-y-1">
            {diff.indexes.map((idx) => (
              <div
                key={idx.indexName}
                className={cn(
                  "px-3 py-2 rounded text-xs flex items-center gap-2",
                  idx.action === "added" && "bg-green-500/5 border border-green-500/10",
                  idx.action === "removed" && "bg-red-500/5 border border-red-500/10",
                  idx.action === "modified" && "bg-yellow-500/5 border border-yellow-500/10",
                )}
              >
                <span className="font-mono text-fg-secondary">{idx.indexName}</span>
                {idx.changes.map((change) => (
                  <span key={change} className="text-xs text-fg-muted">
                    {translateChange(change)}
                  </span>
                ))}
                <span className="ml-auto">{getActionIcon(idx.action)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Foreign Keys */}
      {diff.foreignKeys.length > 0 && (
        <div>
          <h4 className="text-xs text-fg-muted mb-2 font-medium">{t("sections.foreignKeys")}</h4>
          <div className="space-y-1">
            {/* Keyed by the action as well as the column: a foreign key repointed at
                another table is TWO entries under one column name, because the diff
                engine keys an FK by `columnName→table.column` and reports the old one
                removed and the new one added. The column name alone gave React two
                children with the same key. */}
            {diff.foreignKeys.map((fk) => (
              <div
                key={`${fk.action}:${fk.columnName}`}
                className={cn(
                  "px-3 py-2 rounded text-xs flex items-center gap-2",
                  fk.action === "added" && "bg-green-500/5 border border-green-500/10",
                  fk.action === "removed" && "bg-red-500/5 border border-red-500/10",
                )}
              >
                <span className="font-mono text-fg-secondary">{fk.columnName}</span>
                {fk.changes.map((change) => (
                  <span key={change} className="text-xs text-fg-muted">
                    {translateChange(change)}
                  </span>
                ))}
                <span className="ml-auto">{getActionIcon(fk.action)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getActionIcon(action: string) {
  switch (action) {
    case "added":
      return <Plus strokeWidth={1.5} className="w-3 h-3 text-green-400" />;
    case "removed":
      return <Minus className="w-3 h-3 text-red-400" />;
    case "modified":
      return <PenLine strokeWidth={1.5} className="w-3 h-3 text-yellow-400" />;
    default:
      return null;
  }
}
