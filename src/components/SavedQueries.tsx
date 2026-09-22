"use client";

import React, { useState } from "react";
import { storage } from "@/lib/storage";
import { SavedQuery } from "@/lib/types";
import { Bookmark, Search, Trash2, PenLine, Tag, Calendar } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useFormatter, useTranslations } from "next-intl";

interface SavedQueriesProps {
  onSelectQuery: (query: string) => void;
  connectionType?: string;
  refreshTrigger?: number;
}

export function SavedQueries({ onSelectQuery, connectionType, refreshTrigger }: SavedQueriesProps) {
  const t = useTranslations("History.saved");
  const format = useFormatter();
  const [queries, setQueries] = useState<SavedQuery[]>(() => storage.getSavedQueries());
  const [search, setSearch] = useState("");

  // `refreshTrigger` is bumped by whoever writes a saved query. Adjusting state during
  // render is React's prescribed replacement for a setState-in-effect, and unlike a `key`
  // re-mount it leaves the search box the user is typing in alone.
  const [loadedTrigger, setLoadedTrigger] = useState(refreshTrigger);
  if (loadedTrigger !== refreshTrigger) {
    setLoadedTrigger(refreshTrigger);
    setQueries(storage.getSavedQueries());
  }

  const filteredQueries = queries.filter((q) => {
    const matchesSearch =
      q.name.toLowerCase().includes(search.toLowerCase()) || q.query.toLowerCase().includes(search.toLowerCase());
    const matchesType = !connectionType || q.connectionType === connectionType;
    return matchesSearch && matchesType;
  });

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t("deleteConfirm"))) {
      storage.deleteSavedQuery(id);
      setQueries(storage.getSavedQueries());
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="p-4 border-b border-hairline flex flex-col gap-4">
        <h3 className="text-xs font-medium text-fg-tertiary flex items-center gap-2">
          <Bookmark strokeWidth={1.5} className="w-3.5 h-3.5" /> {t("title")}
        </h3>

        <div className="relative">
          <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-fg-muted" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 bg-fill border-hairline-strong text-xs focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredQueries.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-fg-secondary">
            <Bookmark strokeWidth={1.5} className="w-8 h-8 mb-3 text-fg-muted" />
            <p className="text-xs font-medium">{t(queries.length === 0 ? "empty" : "filteredEmpty")}</p>
            <p className="text-xs text-fg-muted mt-1">{t(queries.length === 0 ? "emptyHint" : "filteredEmptyHint")}</p>
          </div>
        )}
        {filteredQueries.length > 0 && (
          <div className="grid grid-cols-1 gap-px bg-fill">
            {filteredQueries.map((q) => (
              <div
                key={q.id}
                className="relative bg-surface p-4 hover:bg-fill-subtle transition-colors group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-xs font-medium mb-1">
                      {/* Stretched-link pattern: the button's ::after overlay makes the
                          whole card clickable while nested action buttons stay above it */}
                      <button
                        type="button"
                        className="text-blue-400 group-hover:text-blue-300 transition-colors cursor-pointer text-left after:absolute after:inset-0"
                        onClick={() => onSelectQuery(q.query)}
                      >
                        {q.name}
                      </button>
                    </h4>
                    {q.description && <p className="text-xs text-fg-muted line-clamp-1">{q.description}</p>}
                  </div>
                  <div className="relative z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("edit", { name: q.name })}
                      title={t("edit", { name: q.name })}
                      className="h-6 w-6 text-fg-muted hover:text-fg-bright"
                      onClick={() => onSelectQuery(q.query)}
                    >
                      <PenLine strokeWidth={1.5} className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("delete", { name: q.name })}
                      className="h-6 w-6 text-fg-muted hover:text-red-400"
                      onClick={(e) => handleDelete(q.id, e)}
                    >
                      <Trash2 strokeWidth={1.5} className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div className="bg-canvas border border-hairline rounded-md p-2 mb-3">
                  <pre className="text-xs font-mono text-fg-tertiary line-clamp-3">{q.query}</pre>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[0.625rem] font-medium text-blue-400">
                      {q.connectionType}
                    </span>
                    {q.tags?.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 text-[0.625rem] text-fg-muted">
                        <Tag strokeWidth={1.5} className="w-2.5 h-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-[0.625rem] text-fg-subtle flex items-center gap-1 font-mono">
                    <Calendar className="w-2.5 h-2.5" />{" "}
                    {format.dateTime(new Date(q.updatedAt), { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
