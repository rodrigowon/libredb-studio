"use client";

import React, { useState } from "react";
import { FileText, LoaderCircle, Search, Sparkles, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableSchema } from "@/lib/types";
import { renderInline } from "@/components/rich-text";
import { downloadText } from "@/lib/export/download";
import { useFormatter, useTranslations } from "next-intl";

interface DatabaseDocsProps {
  schema: TableSchema[];
  schemaContext: string;
  databaseType?: string;
}

interface ParsedSchemaTable {
  name: string;
  rowCount?: number;
  columns?: { name: string; type: string; isPrimary?: boolean; isNullable?: boolean }[];
}

export function DatabaseDocs({ schema, schemaContext, databaseType }: DatabaseDocsProps) {
  const t = useTranslations("Docs");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [aiDocs, setAiDocs] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredSchema = schema.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.columns?.some((c) => c.name.toLowerCase().includes(search.toLowerCase())),
  );

  const generateAiDocs = async () => {
    setIsAiLoading(true);
    setError(null);
    setAiDocs("");

    try {
      let filteredSchemaStr = "";
      if (schemaContext) {
        try {
          const tables = JSON.parse(schemaContext);
          filteredSchemaStr = tables
            .slice(0, 50)
            .map((t: ParsedSchemaTable) => {
              const cols =
                t.columns
                  ?.map(
                    (c) =>
                      `${c.name} (${c.type}${c.isPrimary ? ", PK" : ""}${c.isNullable === false ? ", NOT NULL" : ""})`,
                  )
                  .join(", ") || "";
              return `Table: ${t.name} (${t.rowCount || 0} rows)\nColumns: ${cols}`;
            })
            .join("\n\n");
        } catch {
          filteredSchemaStr = schemaContext.substring(0, 5000);
        }
      }

      const response = await fetch("/api/ai/describe-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaContext: filteredSchemaStr,
          databaseType,
          mode: "full",
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || t("errors.generationFailed"));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error(t("errors.noReader"));

      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += new TextDecoder().decode(value);
        setAiDocs(full);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unknown"));
    } finally {
      setIsAiLoading(false);
    }
  };

  const exportMarkdown = () => {
    let md = `# ${t("markdown.title")}\n\n`;
    md += `**${t("markdown.databaseType")}:** ${databaseType || t("unknownType")}\n`;
    md += `**${t("markdown.tables")}:** ${format.number(schema.length)}\n\n`;

    if (aiDocs) {
      md += `## ${t("markdown.aiAnalysis")}\n\n${aiDocs}\n\n---\n\n`;
    }

    md += `## ${t("markdown.tableReference")}\n\n`;

    for (const table of schema) {
      md += `### ${table.name}\n\n`;
      if (table.rowCount !== undefined) md += `${t("markdown.rows")}: ${format.number(table.rowCount)}\n\n`;

      if (table.columns && table.columns.length > 0) {
        md += `| ${t("markdown.column")} | ${t("markdown.type")} | ${t("markdown.primary")} | ${t("markdown.nullable")} |\n|--------|------|---------|----------|\n`;
        for (const col of table.columns) {
          md += `| ${col.name} | ${col.type} | ${col.isPrimary ? t("yes") : ""} | ${col.nullable !== false ? t("yes") : t("no")} |\n`;
        }
        md += "\n";
      }
    }

    downloadText(md, "text/markdown", "database-docs.md");
  };

  // Simple markdown rendering for AI docs
  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## "))
        return (
          <h2 key={i} className="text-xs font-medium text-fg mt-4 mb-2">
            {line.slice(3)}
          </h2>
        );
      if (line.startsWith("### "))
        return (
          <h3 key={i} className="text-xs font-medium text-fg-secondary mt-3 mb-1">
            {line.slice(4)}
          </h3>
        );
      if (line.startsWith("- ")) {
        return (
          <li key={i} className="text-xs text-fg-tertiary ml-4 leading-relaxed">
            {renderInline(line.slice(2))}
          </li>
        );
      }
      if (line.match(/^\d+\.\s/)) {
        return (
          <li key={i} className="text-xs text-fg-tertiary ml-4 leading-relaxed list-decimal">
            {renderInline(line)}
          </li>
        );
      }
      if (line.trim()) {
        return (
          <p key={i} className="text-xs text-fg-tertiary leading-relaxed">
            {renderInline(line)}
          </p>
        );
      }
      return <div key={i} className="h-1.5" />;
    });
  };

  return (
    <div className="h-full flex flex-col bg-sunken">
      <div className="flex items-center justify-between px-4 py-2 border-b border-hairline bg-surface">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-teal-500/10">
            <FileText strokeWidth={1.5} className="w-3 h-3 text-teal-400" />
          </div>
          <span className="text-xs font-medium text-teal-400">{t("title")}</span>
          <span className="text-[0.625rem] text-fg-muted font-mono">{t("tableCount", { count: schema.length })}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={generateAiDocs}
            disabled={isAiLoading}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
              isAiLoading ? "bg-teal-600/20 text-teal-400 cursor-wait" : "bg-teal-600 hover:bg-teal-500 text-white",
            )}
          >
            {isAiLoading && <LoaderCircle strokeWidth={1.5} className="w-3 h-3 animate-spin" />}
            {!isAiLoading && <Sparkles strokeWidth={1.5} className="w-3 h-3" />}
            {aiDocs ? t("regenerate") : t("aiDescribe")}
          </button>
          <button
            onClick={exportMarkdown}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fill text-fg-tertiary text-xs font-medium hover:bg-fill-strong transition-colors"
          >
            <Download strokeWidth={1.5} className="w-3 h-3" /> {t("exportMarkdown")}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-hairline bg-surface">
        <div className="relative">
          <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-fg-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-full bg-overlay border border-hairline-strong rounded-lg pl-7 pr-3 py-1.5 text-xs text-fg placeholder:text-fg-subtle outline-none focus:border-teal-500/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">{error}</div>
        )}

        {(aiDocs || isAiLoading) && (
          <div className="bg-teal-500/5 border border-teal-500/10 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles strokeWidth={1.5} className="w-3 h-3 text-teal-400" />
              <span className="text-xs font-medium text-teal-400">{t("aiGenerated")}</span>
              {isAiLoading && <LoaderCircle strokeWidth={1.5} className="w-3 h-3 animate-spin text-teal-400" />}
            </div>
            {aiDocs && <div className="prose prose-invert prose-xs max-w-none">{renderMarkdown(aiDocs)}</div>}
          </div>
        )}

        <h3 className="text-xs font-medium text-fg-tertiary">{t("tableReference")}</h3>
        {filteredSchema.map((table) => (
          <div key={table.name} className="bg-surface border border-hairline rounded-lg overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg">{table.name}</span>
                {table.rowCount !== undefined && (
                  <span className="text-xs text-fg-muted font-mono">{t("rows", { count: table.rowCount })}</span>
                )}
              </div>
              <span className="text-xs text-fg-subtle">{t("columns", { count: table.columns?.length || 0 })}</span>
            </div>
            {table.columns && table.columns.length > 0 && (
              <div className="border-t border-hairline">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-fg-muted">
                      <th className="text-left px-3 py-1 font-normal">{t("column")}</th>
                      <th className="text-left px-3 py-1 font-normal">{t("type")}</th>
                      <th className="text-left px-3 py-1 font-normal">PK</th>
                      <th className="text-left px-3 py-1 font-normal">{t("nullable")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.columns.map((col) => (
                      <tr key={col.name} className="border-t border-hairline hover:bg-fill-subtle">
                        <td className="px-3 py-1 text-fg-secondary font-mono">{col.name}</td>
                        <td className="px-3 py-1 text-fg-muted font-mono">{col.type}</td>
                        <td className="px-3 py-1">
                          {col.isPrimary && <span className="text-amber-400 text-[0.625rem] font-medium">PK</span>}
                        </td>
                        <td className="px-3 py-1 text-fg-subtle">{col.nullable !== false ? t("yes") : t("no")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
