"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Table2,
  Play,
  Plus,
  Clock,
  Bookmark,
  Activity,
  Gauge,
  Layers,
  LogOut,
  Bot,
  TextAlignStart,
  Save,
} from "lucide-react";
import { DatabaseConnection, TableSchema, SavedQuery, QueryHistoryItem } from "@/lib/types";
import { storage } from "@/lib/storage";
import { getDBIcon } from "@/lib/db-ui-config";
import { useTranslations } from "next-intl";

interface CommandPaletteProps {
  connections: DatabaseConnection[];
  activeConnection: DatabaseConnection | null;
  schema: TableSchema[];
  onSelectConnection: (conn: DatabaseConnection) => void;
  onTableClick: (tableName: string) => void;
  onAddConnection: () => void;
  onExecuteQuery: () => void;
  onLoadSavedQuery: (query: string) => void;
  onLoadHistoryQuery: (query: string) => void;
  onNavigateHealth: () => void;
  onNavigateMonitoring: () => void;
  onShowDiagram: () => void;
  onFormatQuery: () => void;
  onSaveQuery: () => void;
  /**
   * Asks the agent about what the editor is holding (#331 T3). It replaced
   * `onToggleAI`, which opened an in-editor chat that no longer exists.
   *
   * Optional, and the item is not rendered without it: the agent runtime is off by
   * default, and an action that could only do nothing is the kind of control this
   * shell declines to offer elsewhere too (`MobileNav.onOpenAgent`).
   */
  onAskAgent?: () => void;
  onLogout: () => void;
}

export function CommandPalette({
  connections,
  activeConnection,
  schema,
  onSelectConnection,
  onTableClick,
  onAddConnection,
  onExecuteQuery,
  onLoadSavedQuery,
  onLoadHistoryQuery,
  onNavigateHealth,
  onNavigateMonitoring,
  onShowDiagram,
  onFormatQuery,
  onSaveQuery,
  onAskAgent,
  onLogout,
}: CommandPaletteProps) {
  const t = useTranslations("Studio.commandPalette");
  const [open, setOpen] = useState(false);

  // Register Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load saved queries and history
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const savedQueries = useMemo(() => storage.getSavedQueries().slice(0, 10), [open]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const historyItems = useMemo(() => storage.getHistory().slice(0, 10), [open]);

  const runAction = (action: () => void) => {
    setOpen(false);
    // Small delay to let dialog close before action
    setTimeout(action, 100);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("title")}
      description={t("description")}
      className="sm:max-w-[560px] bg-surface border-hairline-strong"
      showCloseButton={false}
    >
      <CommandInput placeholder={t("placeholder")} className="text-fg" />
      <CommandList className="max-h-[400px]">
        <CommandEmpty className="text-fg-muted">{t("noResults")}</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading={t("actions")}>
          <CommandItem onSelect={() => runAction(onExecuteQuery)}>
            <Play strokeWidth={1.5} className="w-3.5 h-3.5 text-blue-400" />
            <span>{t("runQuery")}</span>
            <CommandShortcut>Ctrl+Enter</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runAction(onFormatQuery)}>
            <TextAlignStart strokeWidth={1.5} className="w-3.5 h-3.5 text-fg-tertiary" />
            <span>{t("formatQuery")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(onSaveQuery)}>
            <Save strokeWidth={1.5} className="w-3.5 h-3.5 text-fg-tertiary" />
            <span>{t("saveCurrentQuery")}</span>
          </CommandItem>
          {onAskAgent && (
            /*
              Named for the ask, not for the surface: `MobileNav` has a control
              called "Agent" that opens the rail and asks nothing, and this one
              carries the editor's statement in with it (review of #331 T3).
            */
            <CommandItem onSelect={() => runAction(onAskAgent)}>
              <Bot strokeWidth={1.5} className="w-3.5 h-3.5 text-blue-400" />
              <span>{t("askAgent")}</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runAction(onAddConnection)}>
            <Plus strokeWidth={1.5} className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t("newConnection")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(onNavigateHealth)}>
            <Activity strokeWidth={1.5} className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t("healthDashboard")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(onNavigateMonitoring)}>
            <Gauge strokeWidth={1.5} className="w-3.5 h-3.5 text-purple-400" />
            <span>{t("monitoring")}</span>
          </CommandItem>
          {activeConnection && (
            <CommandItem onSelect={() => runAction(onShowDiagram)}>
              <Layers strokeWidth={1.5} className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("schemaDiagram")}</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runAction(onLogout)}>
            <LogOut strokeWidth={1.5} className="w-3.5 h-3.5 text-red-400" />
            <span>{t("logout")}</span>
          </CommandItem>
        </CommandGroup>

        {/* Connections */}
        {connections.length > 0 && (
          <CommandGroup heading={t("connections")}>
            {connections.map((conn) => {
              const Icon = getDBIcon(conn.type);
              return (
                <CommandItem key={conn.id} onSelect={() => runAction(() => onSelectConnection(conn))}>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{conn.name}</span>
                  {activeConnection?.id === conn.id && (
                    <span className="ml-auto text-xs text-emerald-500 font-medium">{t("active")}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Tables */}
        {schema.length > 0 && (
          <CommandGroup heading={t("tables")}>
            {schema.map((table) => (
              <CommandItem key={table.name} onSelect={() => runAction(() => onTableClick(table.name))}>
                <Table2 strokeWidth={1.5} className="w-3.5 h-3.5 text-fg-muted" />
                <span>{table.name}</span>
                <span className="ml-auto text-xs text-fg-subtle">
                  {t("columns", { count: table.columns.length })}
                  {table.rowCount !== undefined && ` / ${t("rows", { count: table.rowCount })}`}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Saved Queries */}
        {savedQueries.length > 0 && (
          <CommandGroup heading={t("savedQueries")}>
            {savedQueries.map((sq: SavedQuery) => (
              <CommandItem key={sq.id} onSelect={() => runAction(() => onLoadSavedQuery(sq.query))}>
                <Bookmark strokeWidth={1.5} className="w-3.5 h-3.5 text-purple-400" />
                <span>{sq.name}</span>
                <span className="ml-auto text-xs text-fg-subtle truncate max-w-[150px]">
                  {sq.query.substring(0, 40)}...
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Recent Queries */}
        {historyItems.length > 0 && (
          <CommandGroup heading={t("recentQueries")}>
            {historyItems.map((item: QueryHistoryItem) => (
              <CommandItem key={item.id} onSelect={() => runAction(() => onLoadHistoryQuery(item.query))}>
                <Clock strokeWidth={1.5} className="w-3.5 h-3.5 text-fg-muted" />
                <span className="truncate max-w-[350px] text-fg-tertiary">{item.query.substring(0, 60)}</span>
                <span className="ml-auto text-xs text-fg-subtle">{item.executionTime}ms</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
