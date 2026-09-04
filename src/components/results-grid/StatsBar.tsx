"use client";

import React from "react";
import { QueryResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, LayoutGrid, Table2, LoaderCircle, EyeOff, Eye, Save, X, Funnel, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CellChange } from "@/components/ResultsGrid";
import { describeWarning } from "@/components/results-grid/utils";
import { useTranslations } from "next-intl";

export interface StatsBarProps {
  result: QueryResult;
  filteredRowCount: number;
  activeFilterCount: number;
  onClearFilters: () => void;
  viewMode: "card" | "table";
  onSetViewMode: (mode: "card" | "table") => void;
  // Masking props
  hasSensitive: boolean;
  effectiveMaskingEnabled: boolean;
  userCanToggle: boolean;
  onToggleMasking?: () => void;
  // Editing props
  editingEnabled?: boolean;
  pendingChanges?: CellChange[];
  onApplyChanges?: () => void;
  onDiscardChanges?: () => void;
  // Load more props
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

export function StatsBar({
  result,
  filteredRowCount,
  activeFilterCount,
  onClearFilters,
  viewMode,
  onSetViewMode,
  hasSensitive,
  effectiveMaskingEnabled,
  userCanToggle,
  onToggleMasking,
  editingEnabled,
  pendingChanges,
  onApplyChanges,
  onDiscardChanges,
}: StatsBarProps) {
  const t = useTranslations("Results.stats");
  const warnings = result.warnings ?? [];
  const warningDetail = warnings.map(describeWarning).join("\n");

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-hairline bg-surface text-xs text-fg-muted font-mono">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
          {t("rows", { count: result.rows.length })}
          {result.pagination?.hasMore && <span className="text-amber-400 ml-1">({t("moreAvailable")})</span>}
        </span>
        <span className="hidden sm:inline">{t("columns", { count: result.fields.length })}</span>
        {activeFilterCount > 0 && (
          <button
            className="flex items-center gap-1 text-blue-400 text-xs bg-blue-500/10 px-2 py-0.5 rounded hover:bg-blue-500/20 transition-colors"
            onClick={onClearFilters}
            title={t("clearAllFilters")}
          >
            <Funnel strokeWidth={1.5} className="w-3 h-3" />
            {t("filterSummary", { filters: activeFilterCount, shown: filteredRowCount })}
            <X strokeWidth={1.5} className="w-3 h-3" />
          </button>
        )}
        {result.pagination?.wasLimited && (
          <span className="text-blue-400 text-xs bg-blue-500/10 px-2 py-0.5 rounded">{t("autoLimited")}</span>
        )}
        {warnings.length > 0 && (
          <span className="text-amber-400 text-xs bg-amber-500/10 px-2 py-0.5 rounded" title={warningDetail}>
            {t("warnings", { count: warnings.length })}
            <span className="sr-only">: {warningDetail}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasSensitive &&
          (userCanToggle && onToggleMasking ? (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 px-2 text-xs font-medium gap-1",
                effectiveMaskingEnabled ? "text-purple-400 bg-purple-500/10" : "text-fg-muted",
              )}
              onClick={onToggleMasking}
              title={effectiveMaskingEnabled ? t("showSensitive") : t("maskSensitive")}
            >
              {effectiveMaskingEnabled ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {effectiveMaskingEnabled ? t("masked") : t("mask")}
            </Button>
          ) : effectiveMaskingEnabled ? (
            <span className="h-6 px-2 text-xs font-medium text-purple-400 bg-purple-500/10 rounded flex items-center gap-1">
              <Lock strokeWidth={1.5} className="w-3 h-3" />
              {t("masked")}
            </span>
          ) : null)}

        {editingEnabled && pendingChanges && pendingChanges.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {t("changes", { count: pendingChanges.length })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10"
              onClick={onApplyChanges}
              title={t("applyChanges")}
            >
              <Save strokeWidth={1.5} className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-red-400 hover:bg-red-500/10"
              onClick={onDiscardChanges}
              title={t("discardChanges")}
            >
              <X strokeWidth={1.5} className="w-3 h-3" />
            </Button>
          </div>
        )}

        <span className="hidden sm:flex px-2 py-0.5 rounded bg-fill border border-hairline">
          {t("executionTime", { time: result.executionTime || "0ms" })}
        </span>

        <div className="flex md:hidden items-center bg-fill rounded-lg p-0.5">
          <button
            onClick={() => onSetViewMode("card")}
            aria-label={t("cardView")}
            className={cn(
              "p-1.5 rounded transition-all",
              viewMode === "card" ? "bg-blue-600 text-white" : "text-fg-muted",
            )}
          >
            <LayoutGrid strokeWidth={1.5} className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetViewMode("table")}
            aria-label={t("tableView")}
            className={cn(
              "p-1.5 rounded transition-all",
              viewMode === "table" ? "bg-blue-600 text-white" : "text-fg-muted",
            )}
          >
            <Table2 strokeWidth={1.5} className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export interface LoadMoreFooterProps {
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore?: boolean;
}

export function LoadMoreFooter({ hasMore, onLoadMore, isLoadingMore }: LoadMoreFooterProps) {
  const t = useTranslations("Results.loadMore");
  if (!hasMore) return null;

  return (
    <div className="flex items-center justify-center py-3 border-t border-hairline bg-surface">
      <Button
        variant="outline"
        size="sm"
        onClick={onLoadMore}
        disabled={isLoadingMore}
        className="h-8 px-4 text-xs border-hairline-strong hover:bg-fill"
      >
        {isLoadingMore && (
          <>
            <LoaderCircle strokeWidth={1.5} className="w-3 h-3 mr-2 animate-spin" />
            {t("loading")}
          </>
        )}
        {!isLoadingMore && (
          <>
            <ChevronDown strokeWidth={1.5} className="w-3 h-3 mr-2" />
            {t("action")}
          </>
        )}
      </Button>
    </div>
  );
}
