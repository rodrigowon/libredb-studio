"use client";

import { useTranslations } from "next-intl";

import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Plus, Pencil, Trash2, RotateCcw, Save, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  type MaskingConfig,
  type MaskingPattern,
  type MaskType,
  DEFAULT_MASKING_CONFIG,
  MASK_TYPE_PREVIEWS,
  getPreviewMasked,
  loadMaskingConfig,
  saveMaskingConfig,
} from "@/lib/data-masking";

const ALL_MASK_TYPES: MaskType[] = [
  "email",
  "phone",
  "card",
  "ssn",
  "full",
  "partial",
  "ip",
  "date",
  "financial",
  "custom",
];

export function MaskingSettings() {
  const t = useTranslations("Admin");
  const [config, setConfig] = useState<MaskingConfig>(() => loadMaskingConfig());
  const [editingPattern, setEditingPattern] = useState<MaskingPattern | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNewPattern, setIsNewPattern] = useState(false);

  // Edit dialog state
  const [editName, setEditName] = useState("");
  const [editMaskType, setEditMaskType] = useState<MaskType>("full");
  const [editColumnPatterns, setEditColumnPatterns] = useState("");
  const [editCustomMask, setEditCustomMask] = useState("");

  const handleSave = useCallback(() => {
    saveMaskingConfig(config);
    toast.success(t("masking.saved"));
  }, [config, t]);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_MASKING_CONFIG);
    saveMaskingConfig(DEFAULT_MASKING_CONFIG);
    toast.success(t("masking.reset"));
  }, [t]);

  const toggleGlobal = useCallback((enabled: boolean) => {
    setConfig((prev) => ({ ...prev, enabled }));
  }, []);

  const togglePatternEnabled = useCallback((patternId: string, enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      patterns: prev.patterns.map((p) => (p.id === patternId ? { ...p, enabled } : p)),
    }));
  }, []);

  const updateRoleSetting = useCallback((role: "admin" | "user", key: "canToggle" | "canReveal", value: boolean) => {
    setConfig((prev) => ({
      ...prev,
      roleSettings: {
        ...prev.roleSettings,
        [role]: { ...prev.roleSettings[role], [key]: value },
      },
    }));
  }, []);

  const openEditDialog = useCallback((pattern: MaskingPattern) => {
    setEditingPattern(pattern);
    setEditName(pattern.name);
    setEditMaskType(pattern.maskType);
    setEditColumnPatterns(pattern.columnPatterns.join("\n"));
    setEditCustomMask(pattern.customMask || "");
    setIsNewPattern(false);
    setIsDialogOpen(true);
  }, []);

  const openNewDialog = useCallback(() => {
    setEditingPattern(null);
    setEditName("");
    setEditMaskType("full");
    setEditColumnPatterns("");
    setEditCustomMask("");
    setIsNewPattern(true);
    setIsDialogOpen(true);
  }, []);

  const handleDialogSave = useCallback(() => {
    const patterns = editColumnPatterns
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!editName.trim()) {
      toast.error(t("masking.nameRequired"));
      return;
    }
    if (patterns.length === 0) {
      toast.error(t("masking.patternRequired"));
      return;
    }

    if (isNewPattern) {
      const newPattern: MaskingPattern = {
        id: `custom-${Date.now()}`,
        name: editName.trim(),
        columnPatterns: patterns,
        maskType: editMaskType,
        enabled: true,
        isBuiltin: false,
        customMask: editMaskType === "custom" ? editCustomMask : undefined,
      };
      setConfig((prev) => ({
        ...prev,
        patterns: [...prev.patterns, newPattern],
      }));
    } else if (editingPattern) {
      setConfig((prev) => ({
        ...prev,
        patterns: prev.patterns.map((p) =>
          p.id === editingPattern.id
            ? {
                ...p,
                name: editName.trim(),
                maskType: editMaskType,
                columnPatterns: patterns,
                customMask: editMaskType === "custom" ? editCustomMask : undefined,
              }
            : p,
        ),
      }));
    }

    setIsDialogOpen(false);
  }, [editName, editMaskType, editColumnPatterns, editCustomMask, isNewPattern, editingPattern, t]);

  const deletePattern = useCallback((patternId: string) => {
    setConfig((prev) => ({
      ...prev,
      patterns: prev.patterns.filter((p) => p.id !== patternId),
    }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Global Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs">
            <Shield className="h-5 w-5 text-purple-400" />
            {t("ui.DataMaskingSettings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Global Enable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">{t("ui.EnableDataMaskingGlobally")}</p>
              <p className="text-xs text-muted-foreground">
                {t("ui.Whenenabledsensitivecolumnsareautomaticallydetectedandmasked")}</p>
            </div>
            <Switch checked={config.enabled} onCheckedChange={toggleGlobal} />
          </div>

          {/* Role Permissions */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-fg-secondary">{t("ui.RolePermissions")}</h3>
            <div className="grid gap-3 rounded-lg border border-hairline-strong p-4">
              {/* Admin Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {t("ui.Admin")}</Badge>
                </div>
                <div className="flex items-center gap-6">
                  <label
                    htmlFor="masking-admin-can-toggle"
                    className="flex items-center gap-2 text-xs text-fg-tertiary"
                  >
                    <Switch
                      id="masking-admin-can-toggle"
                      aria-label={t("ui.Admincantoggle")}
                      checked={config.roleSettings.admin.canToggle}
                      onCheckedChange={(v) => updateRoleSetting("admin", "canToggle", v)}
                    />
                    {t("ui.Cantoggle")}</label>
                  <label
                    htmlFor="masking-admin-can-reveal"
                    className="flex items-center gap-2 text-xs text-fg-tertiary"
                  >
                    <Switch
                      id="masking-admin-can-reveal"
                      aria-label={t("ui.Admincanreveal")}
                      checked={config.roleSettings.admin.canReveal}
                      onCheckedChange={(v) => updateRoleSetting("admin", "canReveal", v)}
                    />
                    {t("ui.Canreveal")}</label>
                </div>
              </div>
              {/* User Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {t("ui.User")}</Badge>
                </div>
                <div className="flex items-center gap-6">
                  <label htmlFor="masking-user-can-toggle" className="flex items-center gap-2 text-xs text-fg-tertiary">
                    <Switch
                      id="masking-user-can-toggle"
                      aria-label={t("ui.Usercantoggle")}
                      checked={config.roleSettings.user.canToggle}
                      onCheckedChange={(v) => updateRoleSetting("user", "canToggle", v)}
                    />
                    {t("ui.Cantoggle")}</label>
                  <label htmlFor="masking-user-can-reveal" className="flex items-center gap-2 text-xs text-fg-tertiary">
                    <Switch
                      id="masking-user-can-reveal"
                      aria-label={t("ui.Usercanreveal")}
                      checked={config.roleSettings.user.canReveal}
                      onCheckedChange={(v) => updateRoleSetting("user", "canReveal", v)}
                    />
                    {t("ui.Canreveal")}</label>
                </div>
              </div>
            </div>
          </div>

          {/* Masking Patterns */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-fg-secondary">{t("ui.MaskingPatterns")}</h3>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openNewDialog}>
                <Plus strokeWidth={1.5} className="w-3 h-3 mr-1" />
                {t("ui.AddPattern")}</Button>
            </div>
            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-hairline editor-scrollbar">
              <div className="space-y-2 p-1">
                {config.patterns.map((pattern) => (
                  <div
                    key={pattern.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-3"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Switch checked={pattern.enabled} onCheckedChange={(v) => togglePatternEnabled(pattern.id, v)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-fg">{pattern.name}</span>
                          {pattern.isBuiltin && (
                            <Badge variant="secondary" className="text-[0.625rem] h-4 px-1">
                              {t("ui.builtin")}</Badge>
                          )}
                          <Badge variant="outline" className="text-[0.625rem] h-4 px-1">
                            {pattern.maskType}
                          </Badge>
                        </div>
                        <p className="text-xs text-fg-muted font-mono truncate mt-0.5">
                          {pattern.columnPatterns.join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={t("masking.edit", { name: pattern.name })} onClick={() => openEditDialog(pattern)}>
                        <Pencil strokeWidth={1.5} className="w-3 h-3 text-fg-muted" />
                      </Button>
                      {!pattern.isBuiltin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                          aria-label={t("masking.remove", { name: pattern.name })}
                          onClick={() => deletePattern(pattern.id)}
                        >
                          <Trash2 strokeWidth={1.5} className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-fg-secondary">{t("ui.Preview")}</h3>
            <div className="rounded-lg border border-hairline bg-surface p-4 space-y-2">
              {config.patterns
                .filter((p) => p.enabled)
                .slice(0, 5)
                .map((pattern) => {
                  const preview = MASK_TYPE_PREVIEWS[pattern.maskType];
                  const masked = getPreviewMasked(pattern.maskType, pattern.customMask);
                  return (
                    <div key={pattern.id} className="flex items-center gap-2 text-xs font-mono">
                      <Lock strokeWidth={1.5} className="w-3 h-3 text-purple-400 shrink-0" />
                      <span className="text-fg-muted w-24 truncate">{pattern.name}:</span>
                      <span className="text-fg-subtle line-through">{preview.sample}</span>
                      <span className="text-fg-tertiary mx-1">&rarr;</span>
                      <span className="text-purple-300">{masked}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-hairline">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-3 h-3 mr-1" />
              {t("ui.ResetDefaults")}</Button>
            <Button size="sm" onClick={handleSave}>
              <Save strokeWidth={1.5} className="w-3 h-3 mr-1" />
              {t("ui.SaveConfig")}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Pattern Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md" closeLabel={t("ui.Close")}>
          <DialogHeader>
            <DialogTitle>{isNewPattern ? t("ui.AddMaskingPattern") : t("ui.EditMaskingPattern")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="masking-pattern-name" className="text-xs font-medium text-fg-secondary">
                {t("ui.Name")}</label>
              <Input
                id="masking-pattern-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("ui.Patternname")}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="masking-mask-type" className="text-xs font-medium text-fg-secondary">
                {t("ui.MaskType")}</label>
              <Select value={editMaskType} onValueChange={(v) => setEditMaskType(v as MaskType)}>
                <SelectTrigger id="masking-mask-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_MASK_TYPES.map((maskType) => (
                    <SelectItem key={maskType} value={maskType}>
                      {maskType} — {t(`masking.${maskType}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editMaskType === "custom" && (
              <div className="space-y-2">
                <label htmlFor="masking-custom-mask" className="text-xs font-medium text-fg-secondary">
                  {t("ui.CustomMaskString")}</label>
                <Input
                  id="masking-custom-mask"
                  value={editCustomMask}
                  onChange={(e) => setEditCustomMask(e.target.value)}
                  placeholder={t("ui.eg")}
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="masking-column-patterns" className="text-xs font-medium text-fg-secondary">
                {t("ui.ColumnPatternsoneperline")}</label>
              <textarea
                id="masking-column-patterns"
                className="w-full h-32 bg-surface border border-hairline-strong rounded-md px-3 py-2 text-xs font-mono text-fg focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
                value={editColumnPatterns}
                onChange={(e) => setEditColumnPatterns(e.target.value)}
                placeholder={"email\ne_mail\nuser_email"}
              />
              <p className="text-xs text-fg-muted">
                {t("ui.EachlineismatchedagainstcolumnnamescaseinsensitiveSupportsregex")}</p>
            </div>
            {/* Preview */}
            <div className="rounded-lg border border-hairline bg-surface p-3">
              <p className="text-xs text-fg-muted mb-1">{t("ui.PreviewColon")}</p>
              <p className="text-xs font-mono text-purple-300">
                {getPreviewMasked(editMaskType, editMaskType === "custom" ? editCustomMask : undefined)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              {t("ui.Cancel")}</Button>
            <Button size="sm" onClick={handleDialogSave}>
              {t("ui.Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
