"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Admin.error");
  useEffect(() => {
    console.error("[AdminErrorBoundary]", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface text-fg">
      <div className="max-w-md text-center px-6">
        <h1 className="text-xl font-semibold mb-2">{t("title")}</h1>
        <p className="text-fg-tertiary mb-6 text-sm">
          {t("description")}
        </p>
        {error.digest && <p className="text-fg-subtle text-xs mb-4">{t("id", { id: error.digest })}</p>}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t("retry")}
          </button>
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="px-5 py-2.5 border border-edge hover:border-edge-hover text-fg-secondary rounded-lg text-sm font-medium transition-colors"
          >
            {t("back")}
          </button>
        </div>
      </div>
    </div>
  );
}
