"use client";

import { useTranslations } from "next-intl";
import reference from "../../messages/en/monitoring.json";

const labelKeys = new Map(
  Object.entries(reference.provider).map(([key, value]) => [value, key]),
);

// Only for provider-owned UI labels, never for query results or raw errors.
// Unknown upstream wording stays intact until a corresponding translation exists.
export function useMonitoringLabel() {
  const t = useTranslations("Monitoring.provider");
  return (label: string): string => {
    const key = labelKeys.get(label);
    return key ? t(key) : label;
  };
}
