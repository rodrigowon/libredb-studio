import { formatBytes } from "@/lib/db/utils/pool-manager";

/** Localize only the formatter's numeric display, retaining its rounding and units. */
export function formatMonitoringBytes(bytes: number, locale: string): string {
  const formatted = formatBytes(bytes);
  const match = /^(\d+)(?:\.(\d+))? (\w+)$/.exec(formatted);
  if (!match) return formatted;
  const digits = match[2]?.length ?? 0;
  const value = Number(match[1] + (match[2] ? `.${match[2]}` : ""));
  return `${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${match[3]}`;
}
