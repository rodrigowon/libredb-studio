"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { isSupportedLocale, resolveLocale } from "@/i18n/config";

interface LocaleSwitcherProps {
  onLocaleChange?: (locale: string) => Promise<void>;
  variant?: "default" | "menu";
}

export function LocaleSwitcher({ onLocaleChange = setLocale, variant = "default" }: LocaleSwitcherProps) {
  const locale = resolveLocale(useLocale());
  const t = useTranslations("Common.language");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label={t("label")}
      className={
        variant === "menu"
          ? "h-8 w-full rounded-md border border-hairline-strong bg-surface px-2 text-xs text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60"
          : "h-8 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground shadow-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      }
      disabled={isPending}
      value={locale}
      onChange={(event) => {
        const nextLocale = event.target.value;
        if (!isSupportedLocale(nextLocale) || nextLocale === locale) return;

        startTransition(async () => {
          await onLocaleChange(nextLocale);
          router.refresh();
        });
      }}
    >
      <option value="pt-BR">{t("ptBR")}</option>
      <option value="en">{t("en")}</option>
    </select>
  );
}
