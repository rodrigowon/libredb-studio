"use client";

import React from "react";
import type { DatabaseConnection } from "@/lib/types";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Database, Gauge, LogOut, Settings, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { GitHubRepoLink } from "@/components/github-repo-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useTranslations } from "next-intl";

interface StudioDesktopHeaderProps {
  activeConnection: DatabaseConnection | null;
  connectionPulse: "healthy" | "degraded" | "error" | null;
  user: { role?: string } | null;
  isAdmin: boolean;
  onLogout: () => void;
}

export function StudioDesktopHeader({
  activeConnection,
  connectionPulse,
  user,
  isAdmin,
  onLogout,
}: StudioDesktopHeaderProps) {
  const router = useRouter();
  const t = useTranslations("Studio.header");
  const tEnvironment = useTranslations("Connections.environmentLong");

  return (
    <header className="hidden md:flex h-12 shrink-0 gap-3 border-b border-hairline items-center justify-between px-3 bg-surface sticky top-0 z-30">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="p-1.5 shrink-0 rounded-md bg-fill border border-hairline">
          <Database strokeWidth={1.5} className="w-3.5 h-3.5 text-fg-tertiary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xs font-medium text-fg truncate" title={activeConnection?.name}>
            {activeConnection ? activeConnection.name : t("quickAccess")}
          </h1>
          {activeConnection && (
            <p className="text-xs text-fg-tertiary font-mono uppercase leading-none mt-1 truncate">
              {activeConnection.type}
              {activeConnection.environment && activeConnection.environment !== "other" && (
                <span className="ml-1 font-medium" style={{ color: activeConnection.color || "#22c55e" }}>
                  • {tEnvironment(activeConnection.environment)}
                </span>
              )}
              {!activeConnection.environment && (
                <span>
                  {" "}
                  • <span className="text-emerald-500/80">{t("online")}</span>
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {connectionPulse && (
          <div
            className="flex items-center gap-1.5 px-2 h-7 rounded-md mr-1"
            title={t("connectionStatus", { status: t(connectionPulse === "healthy" ? "online" : connectionPulse === "degraded" ? "slow" : "error") })}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                connectionPulse === "healthy" && "bg-emerald-500 animate-pulse",
                connectionPulse === "degraded" && "bg-amber-500",
                connectionPulse === "error" && "bg-red-500",
              )}
            />
            <span className="text-xs font-medium text-fg-tertiary">
              {connectionPulse === "healthy" ? t("online") : connectionPulse === "degraded" ? t("slow") : t("error")}
            </span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs font-medium gap-2 text-fg-tertiary hover:text-fg hover:bg-fill"
          aria-label={t("monitoring")}
          title={t("monitoring")}
          onClick={() => router.push("/monitoring")}
        >
          <Gauge strokeWidth={1.5} className="w-3.5 h-3.5" /> <span className="hidden lg:inline">{t("monitoring")}</span>
        </Button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 hover:bg-fill p-0" aria-label={t("userMenu")} title={t("userMenu")}>
                <User strokeWidth={1.5} className="w-3.5 h-3.5 text-fg-tertiary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-raised border-hairline-strong text-fg-secondary">
              {isAdmin && (
                <DropdownMenuItem onClick={() => router.push("/admin")} className="cursor-pointer">
                  <Settings strokeWidth={1.5} className="w-3.5 h-3.5 mr-2" /> {t("adminDashboard")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => router.push("/monitoring")} className="cursor-pointer">
                <Gauge strokeWidth={1.5} className="w-3.5 h-3.5 mr-2" /> {t("monitoring")}
              </DropdownMenuItem>
              <div className="border-t border-hairline my-1 px-2 py-1">
                <LocaleSwitcher variant="menu" />
              </div>
              <div className="border-t border-hairline my-1" />
              <DropdownMenuItem onClick={onLogout} className="text-red-400 cursor-pointer">
                <LogOut strokeWidth={1.5} className="w-3.5 h-3.5 mr-2" /> {t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Renders nothing when a host (platform) owns the theme — see ThemeToggle. */}
        <ThemeToggle className="h-8 w-8 justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div className="flex items-center gap-1 border-l border-hairline pl-2 ml-1">
          <GitHubRepoLink className="h-8 w-8 rounded-md text-fg-tertiary hover:text-fg-bright hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <span className="text-xs text-fg-muted font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        </div>
      </div>
    </header>
  );
}
