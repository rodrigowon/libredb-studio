import "../../setup-dom";
import React from "react";
import { afterEach, expect, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import { renderWithIntl } from "../../helpers/render-with-intl";
import { useMonitoringLabel } from "@/i18n/use-monitoring-label";

afterEach(cleanup);

function Labels() {
  const label = useMonitoringLabel();
  return <div>{["Run Analyze", "Run Vacuum", "Run Reindex", "Pool statistics not available for this provider", "Custom engine label"].map((value) => <p key={value}>{label(value)}</p>)}</div>;
}

test("translates known presentation labels and retains SQL commands and unknown labels", () => {
  const view = renderWithIntl(<Labels />, "pt-BR");
  for (const command of ["ANALYZE", "VACUUM", "REINDEX"]) {
    expect(view.getByText(`Executar ${command}`)).toBeTruthy();
  }
  expect(view.getByText("Estatísticas do Pool indisponíveis para este provider")).toBeTruthy();
  expect(view.getByText("Custom engine label")).toBeTruthy();
});

test("keeps upstream English presentation labels", () => {
  const view = renderWithIntl(<Labels />, "en");
  for (const command of ["Run Analyze", "Run Vacuum", "Run Reindex"]) {
    expect(view.getByText(command)).toBeTruthy();
  }
  expect(view.getByText("Custom engine label")).toBeTruthy();
});
