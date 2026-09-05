import { expect, test } from "bun:test";
import { formatMonitoringBytes } from "@/i18n/format-monitoring-bytes";

test("localizes byte display without changing the upstream units or rounding", () => {
  expect(formatMonitoringBytes(1536, "en")).toBe("1.5 KB");
  expect(formatMonitoringBytes(1536, "pt-BR")).toBe("1,5 KB");
  expect(formatMonitoringBytes(0, "pt-BR")).toBe("0 B");
  expect(formatMonitoringBytes(-1, "pt-BR")).toBe("N/A");
  expect(formatMonitoringBytes(Infinity, "pt-BR")).toBe("N/A");
  expect(formatMonitoringBytes(1024 ** 6, "pt-BR")).toBe("1 EB");
});
