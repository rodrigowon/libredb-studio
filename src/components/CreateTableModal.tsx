"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Table as TableIcon, Type, Settings2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { DatabaseType } from "@/lib/types";
import {
  AUTO_INCREMENT,
  defaultColumns,
  generateCreateTableSQL,
  reconcileColumns,
  resolveCreateTableDialect,
  type ColumnDefinition,
} from "@/lib/create-table";

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTableCreated: (sql: string) => void;
  dbType?: DatabaseType;
}

export function CreateTableModal({ isOpen, onClose, onTableCreated, dbType }: CreateTableModalProps) {
  const t = useTranslations("DataTools.createTable");
  const dialect = resolveCreateTableDialect(dbType);
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<ColumnDefinition[]>(() => defaultColumns(dbType));
  const [isSubmitting] = useState(false);
  const [renderedFor, setRenderedFor] = useState(dbType);
  if (renderedFor !== dbType) {
    setRenderedFor(dbType);
    // Arrival of the engine after mount must also initialize its default key.
    setColumns(
      !tableName && JSON.stringify(columns) === JSON.stringify(defaultColumns(renderedFor))
        ? defaultColumns(dbType)
        : reconcileColumns(columns, dbType),
    );
  }

  const addColumn = () => {
    setColumns([
      ...columns,
      {
        name: "",
        type: dialect.types[0],
        isPrimary: false,
        isNullable: true,
        isUnique: false,
        defaultValue: "",
      },
    ]);
  };

  const removeColumn = (index: number) => {
    if (columns.length === 1) return;
    setColumns(columns.filter((_, i) => i !== index));
  };

  const updateColumn = (index: number, updates: Partial<ColumnDefinition>) => {
    setColumns(columns.map((col, i) => (i === index ? { ...col, ...updates } : col)));
  };

  const generateSQL = () => {
    return generateCreateTableSQL(tableName, columns, dbType);
  };

  const handleCreate = async () => {
    // The name check is unreachable via the UI (the input sanitizes whitespace
    // to "_" and the button disables on empty); kept for imperative callers.
    const nameError = tableName.trim() ? "" : t("nameRequired");
    const columnError = columns.some((c) => !c.name.trim()) ? t("columnNameRequired") : "";
    const validationError = nameError || columnError;
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const sql = generateSQL();
    onTableCreated(sql);
    onClose();
    setTableName("");
    setColumns(defaultColumns(dbType));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-surface border-hairline-strong text-fg p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 py-4 border-b border-hairline bg-panel">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <TableIcon strokeWidth={1.5} className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-xs font-medium">{t("title")}</DialogTitle>
              <p className="text-xs text-fg-muted mt-1 font-medium">{t("description")}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {/* Table Name Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 strokeWidth={1.5} className="w-3.5 h-3.5 text-blue-500/50" />
              <Label className="text-xs font-medium text-fg-muted">{t("generalSettings")}</Label>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tableName" className="text-xs font-medium text-fg-tertiary">
                {t("tableName")}
              </Label>
              <Input
                id="tableName"
                placeholder={t("tablePlaceholder")}
                value={tableName}
                onChange={(e) => setTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                className="bg-raised border-hairline focus-visible:ring-blue-500/50"
              />
            </div>
          </div>

          {/* Columns Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type strokeWidth={1.5} className="w-3.5 h-3.5 text-emerald-500/50" />
                <Label className="text-xs font-medium text-fg-muted">{t("columnDefinitions")}</Label>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={addColumn}
                className="h-7 text-xs font-medium gap-2 hover:bg-emerald-500/10 hover:text-emerald-400"
              >
                <Plus strokeWidth={1.5} className="w-3 h-3" /> {t("addColumn")}
              </Button>
            </div>

            <div className="space-y-3">
              {columns.map((col, index) => (
                <div
                  key={index}
                  className="flex items-end gap-3 p-3 rounded-lg bg-panel border border-hairline group hover:border-hairline-strong transition-colors"
                >
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs text-fg-muted font-medium">{t("columnName")}</Label>
                    <Input
                      value={col.name}
                      onChange={(e) =>
                        updateColumn(index, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
                      }
                      placeholder={t("columnPlaceholder")}
                      className="h-8 text-xs bg-surface border-hairline"
                    />
                  </div>

                  <div className="w-40 space-y-2">
                    <Label className="text-xs text-fg-muted font-medium">{t("type")}</Label>
                    <Select value={col.type} onValueChange={(val) => updateColumn(index, { type: val })}>
                      <SelectTrigger className="h-8 text-xs bg-surface border-hairline">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-surface border-hairline-strong">
                        {dialect.types.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {t}
                          </SelectItem>
                        ))}
                        {col.isPrimary && dialect.autoIncrement && (
                          <SelectItem value={AUTO_INCREMENT} className="text-xs text-yellow-500">
                            {t("autoIncrement")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-4 pb-2 px-2">
                    {dialect.supportsConstraints && (
                      <div className="flex flex-col items-center gap-1.5" title={t("primaryKey")}>
                        <Label className="text-[0.5rem] text-fg-subtle uppercase font-black">PK</Label>
                        <Checkbox
                          checked={col.isPrimary}
                          onCheckedChange={(checked) =>
                            updateColumn(index, {
                              isPrimary: !!checked,
                              isNullable: checked ? false : col.isNullable,
                              type: !checked && col.type === AUTO_INCREMENT ? dialect.keyType : col.type,
                            })
                          }
                          className="border-edge data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                        />
                      </div>
                    )}
                    <div className="flex flex-col items-center gap-1.5" title={t("nullable")}>
                      <Label className="text-[0.5rem] text-fg-subtle uppercase font-black">{t("nullableShort")}</Label>
                      <Checkbox
                        checked={col.isNullable}
                        onCheckedChange={(checked) => updateColumn(index, { isNullable: !!checked })}
                        className="border-edge data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                      />
                    </div>
                    {dialect.supportsConstraints && (
                      <div className="flex flex-col items-center gap-1.5" title={t("unique")}>
                        <Label className="text-[0.5rem] text-fg-subtle uppercase font-black">{t("uniqueShort")}</Label>
                        <Checkbox
                          checked={col.isUnique}
                          onCheckedChange={(checked) => updateColumn(index, { isUnique: !!checked })}
                          className="border-edge data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                        />
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-fg-subtle hover:text-red-400 hover:bg-red-500/10 mb-0.5"
                    onClick={() => removeColumn(index)}
                    aria-label={t("removeColumn")}
                  >
                    <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview Section */}
          <div className="p-4 rounded-lg bg-black border border-hairline font-mono">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-medium text-fg-muted">{t("sqlPreview")}</span>
              </div>
              <span className="text-[0.625rem] text-fg-faint">{t("autoGenerated")}</span>
            </div>
            <pre className="text-xs text-blue-400/80 whitespace-pre-wrap leading-relaxed">
              {generateSQL() || t("previewPlaceholder")}
            </pre>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-hairline bg-panel">
          <Button variant="ghost" onClick={onClose} className="text-xs text-fg-tertiary hover:text-fg-bright">
            {t("cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isSubmitting || !tableName}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium gap-2 px-6"
          >
            {isSubmitting ? (
              <LoaderCircle strokeWidth={1.5} className="w-3 h-3 animate-spin" />
            ) : (
              <Plus strokeWidth={1.5} className="w-3 h-3" />
            )}
            CREATE TABLE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
