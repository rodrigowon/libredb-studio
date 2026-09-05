"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { EyeOff, Lock, Activity, KeyRound, Save, RotateCcw } from "lucide-react";
import { MaskingSettings } from "@/components/MaskingSettings";
import { DEFAULT_THRESHOLDS, type ThresholdConfig } from "@/lib/monitoring-thresholds";
import { storage } from "@/lib/storage";
import { toast } from "sonner";


export function SecurityTab() {
  const t = useTranslations("Admin");
  return (
    <div className="space-y-6">
      <Tabs defaultValue="masking">
        <TabsList className="bg-transparent border-b border-hairline rounded-none p-0 h-10 w-full justify-start">
          <TabsTrigger
            value="masking"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 text-fg-muted text-xs px-4"
          >
            <EyeOff className="h-3.5 w-3.5" />
            {t("ui.DataMasking")}
          </TabsTrigger>
          <TabsTrigger
            value="access"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 text-fg-muted text-xs px-4"
          >
            <Lock className="h-3.5 w-3.5" />
            {t("security.access")}
          </TabsTrigger>
          <TabsTrigger
            value="thresholds"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 text-fg-muted text-xs px-4"
          >
            <Activity className="h-3.5 w-3.5" />
            {t("ui.Thresholds")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="masking" className="mt-4">
          <MaskingSettings />
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <AccessSummary />
        </TabsContent>

        <TabsContent value="thresholds" className="mt-4">
          <ThresholdSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccessSummary() {
  const t = useTranslations("Admin");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-hairline bg-panel p-5 space-y-3">
        <h3 className="text-sm font-bold text-fg-secondary flex items-center gap-2">
          <Lock className="h-4 w-4 text-blue-400" />
          {t("security.title")}
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">{t("ui.Authentication")}</span>
            <span className="text-fg-secondary">{t("ui.EnvironmentVariableRBAC")}</span>
          </div>
          <Separator className="bg-fill" />
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">{t("ui.APISecurity")}</span>
            <div className="flex items-center gap-1.5">
              <KeyRound className="h-3 w-3 text-fg-muted" />
              <span className="text-fg-secondary">{t("ui.JWTHTTPonlyCookie")}</span>
            </div>
          </div>
          <Separator className="bg-fill" />
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">{t("ui.AdminAccess")}</span>
            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">{t("ui.ENABLED")}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">{t("ui.UserAccess")}</span>
            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">{t("ui.ENABLED")}</Badge>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-panel p-5 space-y-3">
        <h3 className="text-sm font-bold text-fg-secondary">{t("ui.ConnectionSecurity")}</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">SSL/TLS</span>
            <Badge variant="secondary" className="text-xs">
              {t("security.supported")}
            </Badge>
          </div>
          <Separator className="bg-fill" />
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">{t("ui.SSHTunnel")}</span>
            <Badge variant="secondary" className="text-xs">
              {t("security.supported")}
            </Badge>
          </div>
          <Separator className="bg-fill" />
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">{t("ui.DataMasking")}</span>
            <Badge variant="secondary" className="text-xs">
              {t("security.configurable")}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThresholdSettings() {
  const t = useTranslations("Admin");
  // getThresholdConfig() already falls back to DEFAULT_THRESHOLDS when nothing is
  // stored, so reading it in the initializer covers both cases in one render.
  const [thresholds, setThresholds] = useState<ThresholdConfig[]>(() => storage.getThresholdConfig());
  const [hasChanges, setHasChanges] = useState(false);

  const updateThreshold = (index: number, field: "warning" | "critical", value: number) => {
    setThresholds((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    storage.saveThresholdConfig(thresholds);
    setHasChanges(false);
    toast.success(t("security.saved"));
  };

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS);
    storage.saveThresholdConfig(DEFAULT_THRESHOLDS);
    setHasChanges(false);
    toast.success(t("security.reset"));
  };

  const getSliderColors = (threshold: ThresholdConfig) => {
    if (threshold.direction === "above") {
      return { warn: "text-amber-400", crit: "text-red-400" };
    }
    return { warn: "text-amber-400", crit: "text-red-400" };
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hairline bg-panel p-5">
        <h3 className="text-sm font-bold text-fg-secondary mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          {t("security.thresholdTitle")}
        </h3>
        <p className="text-xs text-fg-muted mb-6">{t("security.thresholdDescription")}</p>

        <div className="space-y-6">
          {thresholds.map((threshold, index) => {
            const colors = getSliderColors(threshold);
            const isPercent = threshold.metric !== "deadlocks";
            const max = isPercent ? 100 : 20;

            return (
              <div key={threshold.metric} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-fg-secondary">{DEFAULT_THRESHOLDS.some((item) => item.metric === threshold.metric && item.label === threshold.label) && t.has(`security.${threshold.metric}`) ? t(`security.${threshold.metric}`) : threshold.label}</span>
                  <span className="text-xs text-fg-subtle uppercase font-bold">
                    {threshold.direction === "above" ? t("security.above") : t("security.below")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${colors.warn}`}>{t("ui.Warning")}</span>
                      <span className="text-xs font-mono text-fg-tertiary">
                        {threshold.warning}
                        {isPercent ? "%" : ""}
                      </span>
                    </div>
                    <Slider
                      value={[threshold.warning]}
                      onValueChange={(v) => updateThreshold(index, "warning", v[0])}
                      max={max}
                      step={1}
                      className="[&_[role=slider]]:bg-amber-500 [&_[role=slider]]:border-amber-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${colors.crit}`}>{t("ui.Critical")}</span>
                      <span className="text-xs font-mono text-fg-tertiary">
                        {threshold.critical}
                        {isPercent ? "%" : ""}
                      </span>
                    </div>
                    <Slider
                      value={[threshold.critical]}
                      onValueChange={(v) => updateThreshold(index, "critical", v[0])}
                      max={max}
                      step={1}
                      className="[&_[role=slider]]:bg-red-500 [&_[role=slider]]:border-red-500"
                    />
                  </div>
                </div>

                {index < thresholds.length - 1 && <Separator className="bg-fill" />}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-hairline">
          <Button variant="ghost" size="sm" className="text-fg-muted hover:text-fg-secondary" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {t("ui.ResetDefaults")}
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 text-white"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {t("ui.SaveConfig")}
          </Button>
        </div>
      </div>
    </div>
  );
}
