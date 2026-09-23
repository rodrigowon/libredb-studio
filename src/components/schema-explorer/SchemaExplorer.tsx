"use client";

import React, { useState, useMemo, useCallback } from "react";
import { TableSchema } from "@/lib/types";
import type { ProviderMetadata } from "@/hooks/use-provider-metadata";
import { Search, Hash, LoaderCircle, CircleAlert, Database, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatePresence } from "framer-motion";
import { SchemaTools } from "@/components/sidebar/SchemaTools";
import { TableItem } from "./TableItem";
import { useTranslations } from "next-intl";

interface SchemaExplorerProps {
  onShowDiagram?: () => void;
  onShowDocs?: () => void;
  onCompareSchemas?: () => void;
  schema: TableSchema[];
  isLoadingSchema: boolean;
  /**
   * Why the schema read produced nothing, in the engine's own words. Optional so the
   * embedded shell, which has no error to hand over, is unchanged — undefined and null
   * both mean "nothing failed", not "nothing was wrong".
   */
  schemaError?: string | null;
  onTableClick?: (tableName: string) => void;
  onGenerateSelect?: (tableName: string) => void;
  onCreateTableClick?: () => void;
  isAdmin?: boolean;
  onOpenMaintenance?: (tab?: "global" | "tables" | "sessions", table?: string) => void;
  databaseType?: string;
  metadata?: ProviderMetadata | null;
  onProfileTable?: (tableName: string) => void;
  onGenerateCode?: (tableName: string) => void;
  onGenerateTestData?: (tableName: string) => void;
}

export function SchemaExplorer({
  onShowDiagram,
  onShowDocs,
  onCompareSchemas,
  schema,
  isLoadingSchema,
  schemaError = null,
  onTableClick,
  onGenerateSelect,
  onCreateTableClick,
  isAdmin = false,
  onOpenMaintenance,
  metadata,
  onProfileTable,
  onGenerateCode,
  onGenerateTestData,
}: SchemaExplorerProps) {
  const t = useTranslations("Studio.sidebar");
  const labels = metadata?.labels;
  const capabilities = metadata?.capabilities;
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleTable = useCallback((tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  }, []);

  const filteredSchema = useMemo(() => {
    if (!searchQuery) return schema;
    const query = searchQuery.toLowerCase();

    return schema.filter((table) => {
      const tableNameMatch = table.name.toLowerCase().includes(query);
      const columnMatch = table.columns.some((col) => col.name.toLowerCase().includes(query));
      return tableNameMatch || columnMatch;
    });
  }, [schema, searchQuery]);

  const explorerBar = (
    <fieldset className="min-w-0" aria-label={t("explorer")}>
      <div className="flex flex-wrap items-center justify-between gap-y-1">
        <div className="flex items-center gap-2">
          <Database strokeWidth={1.5} className="w-3.5 h-3.5 text-blue-500/50" />
          <span className="text-xs font-medium text-muted-foreground">{t("explorer")}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {!isLoadingSchema && schema.length > 0 && isAdmin && (
            <button
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-amber-400 transition-colors"
              onClick={() => onOpenMaintenance?.("global")}
              title={t("maintenance")}
            >
              <Settings strokeWidth={1.5} className="w-3.5 h-3.5" />
            </button>
          )}
          {!isLoadingSchema && schema.length > 0 && capabilities?.supportsCreateTable !== false && (
            <button
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-blue-400 transition-colors"
              onClick={onCreateTableClick}
              title={t("createEntity", { entity: labels?.entityName || "Table" })}
            >
              <Plus strokeWidth={1.5} className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[0.625rem] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full font-mono border border-blue-500/10">
            {schema.length}
          </span>
          <SchemaTools onShowDiagram={onShowDiagram} onShowDocs={onShowDocs} onCompareSchemas={onCompareSchemas} />
        </div>
      </div>
    </fieldset>
  );

  if (isLoadingSchema) {
    return (
      <div className="flex flex-col">
        {explorerBar}
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <div className="relative mb-4">
            <LoaderCircle strokeWidth={1.5} className="w-8 h-8 animate-spin text-blue-500/20" />
            <Database strokeWidth={1.5} className="w-3.5 h-3.5 absolute inset-0 m-auto text-blue-500 animate-pulse" />
          </div>
          <span className="text-xs font-medium animate-pulse">{t("scanningSchema")}</span>
        </div>
      </div>
    );
  }

  // A failed read is not an empty database (D31). The tree is empty either way, so
  // the message is the only thing that can say which happened — and it is checked
  // BEFORE the empty state, because "no tables found" over a refused read attributes
  // an absence to the database that was never measured.
  if (schemaError !== null && schema.length === 0) {
    return (
      <div className="flex flex-col">
        {explorerBar}
        <div
          data-testid="schema-read-failed"
          className="flex flex-col items-center justify-center py-12 px-6 text-center"
        >
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 border border-border">
            <CircleAlert strokeWidth={1.5} className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-foreground text-xs font-medium mb-1">{t("schemaUnavailable")}</h3>
          <p className="text-xs text-muted-foreground mb-2">{t("schemaUnavailableHint")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed break-words">{schemaError}</p>
        </div>
      </div>
    );
  }

  if (schema.length === 0) {
    return (
      <div className="flex flex-col">
        {explorerBar}
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 border border-border">
            <Database strokeWidth={1.5} className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-foreground text-xs font-medium mb-1">{t("noStructures")}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("noStructuresHint")}
          </p>
          {capabilities?.supportsCreateTable === true && onCreateTableClick && (
            <Button variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={onCreateTableClick}>
              {t("createTableEmpty")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 px-1 pb-3 pt-1 space-y-3 bg-background">
        {explorerBar}

        <div className="relative group">
          <Search
            strokeWidth={1.5}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors"
          />
          <Input
            placeholder={labels?.searchPlaceholder || t("search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-blue-500/50 placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t("clearSearch")}
            >
              <Hash strokeWidth={1.5} className="w-3.5 h-3.5 rotate-45" />
            </button>
          )}
        </div>
      </div>

      <div className="px-2 space-y-1">
        {filteredSchema.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs font-medium text-foreground">{t("searchEmpty")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("searchEmptyHint")}</p>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {filteredSchema.map((table) => (
            <TableItem
              key={table.name}
              table={table}
              isExpanded={expandedTables.has(table.name)}
              onToggle={() => toggleTable(table.name)}
              labels={labels}
              capabilities={capabilities}
              isAdmin={isAdmin}
              onTableClick={onTableClick}
              onGenerateSelect={onGenerateSelect}
              onProfileTable={onProfileTable}
              onGenerateCode={onGenerateCode}
              onGenerateTestData={onGenerateTestData}
              onOpenMaintenance={onOpenMaintenance}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
