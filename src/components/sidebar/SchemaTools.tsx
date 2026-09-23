"use client";

import { Ellipsis, FileText, GitCompare, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface SchemaToolsProps {
  onShowDiagram?: () => void;
  onShowDocs?: () => void;
  onCompareSchemas?: () => void;
}

/** Shared by the sidebar and mobile schema view; only existing actions are offered. */
export function SchemaTools({ onShowDiagram, onShowDocs, onCompareSchemas }: SchemaToolsProps) {
  const t = useTranslations("Studio.navigation");
  if (!onShowDiagram && !onShowDocs && !onCompareSchemas) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded text-muted-foreground" aria-label={t("schemaTools")} title={t("schemaTools")}>
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52 rounded-md">
        {onShowDiagram && <DropdownMenuItem onSelect={onShowDiagram}><Layers className="h-3.5 w-3.5" />{t("erd")}</DropdownMenuItem>}
        {onShowDocs && <DropdownMenuItem onSelect={onShowDocs}><FileText className="h-3.5 w-3.5" />{t("docs")}</DropdownMenuItem>}
        {onCompareSchemas && <DropdownMenuItem onSelect={onCompareSchemas}><GitCompare className="h-3.5 w-3.5" />{t("diff")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
