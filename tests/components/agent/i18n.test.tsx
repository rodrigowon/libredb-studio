import "../../setup-dom";
import "../../helpers/mock-sonner";
import "../../helpers/mock-navigation";
import React, { createRef } from "react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { IntlTestProvider, renderWithIntl as render } from "../../helpers/render-with-intl";
import { QuerySafetyDialog, isDangerousQuery } from "@/components/QuerySafetyDialog";
import { AgentRail } from "@/components/agent/AgentRail";
import { ConsentCard } from "@/components/agent/ConsentCard";
import { AnswerCard } from "@/components/agent/AnswerCard";
import { VisualExplain } from "@/components/VisualExplain";
import { foldLedgerEntries } from "@/components/agent/timeline";
import { useAgentArtifact } from "@/components/agent/use-agent-artifact";
import type { AgentLedgerEntry } from "@/lib/agent/run-store";
import type { Locale } from "@/i18n/config";

const SQL = "DELETE FROM customers;";
const RAW = "Missing environment variable LLM_API_KEY — provider OpenAI gpt-test";
const OBJECTIVE = 'Please inspect customers. Keep {"customer_id": 7} unchanged.';
const MODEL = "**Model explanation**\n\n```sql\n" + SQL + '\n```\n\n```json\n{"customer_id":7}\n```';
const originalFetch = globalThis.fetch;
const originalMedia = window.matchMedia;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stream = (text: string) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
  );
const safety = {
  riskLevel: "critical" as const,
  summary: "The model says: review this statement.",
  warnings: [{ type: "delete", severity: "critical" as const, message: "Raw model warning", detail: RAW }],
  affectedRows: "all customers",
  cascadeEffects: "Raw model cascade",
  recommendation: "Keep this recommendation in English.",
};
const entries = (finished = true): AgentLedgerEntry[] =>
  [
    {
      kind: "run-opened",
      atMs: 1000,
      runId: "arun_i18n",
      mode: "planning",
      actor: { sessionId: "test", role: "user" },
      connectionId: "seed:test",
      objective: OBJECTIVE,
    },
    { kind: "event", event: { kind: "run-started", atMs: 1001, mode: "planning" } },
    { kind: "event", event: { kind: "driver-resolved", atMs: 1002, modelId: "gpt-test" } },
    { kind: "event", event: { kind: "closing-statement", atMs: 1100, text: MODEL } },
    {
      kind: "event",
      event: {
        kind: "plan-statement-drafted",
        atMs: 1101,
        sql: SQL,
        readOnly: false,
        guardApplicable: true,
        guardViolation: "NON_READ_STATEMENT",
        identifiers: { kind: "checked", unknownTables: [] },
      },
    },
    ...(finished ? [{ kind: "event", event: { kind: "run-finished", atMs: 2500, status: "succeeded" } }] : []),
  ] as AgentLedgerEntry[];

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  globalThis.fetch = originalFetch;
  window.matchMedia = originalMedia;
});

describe("Phase 5B presentation boundaries", () => {
  for (const locale of ["en", "pt-BR"] as const) {
    for (const [risk, english, portuguese] of [
      ["safe", "Safe", "Segura"],
      ["low", "Low Risk", "Risco baixo"],
      ["medium", "Medium Risk", "Risco médio"],
      ["high", "High Risk", "Risco alto"],
      ["critical", "Critical Risk", "Risco crítico"],
    ] as const) {
      test(`Query Safety ${locale}: risk ${risk} changes display only`, async () => {
        const result = { ...safety, riskLevel: risk };
        const view = render(
          <QuerySafetyDialog
            isOpen
            query={SQL}
            schemaContext=""
            onAnalyzeSafety={async () => result}
            onClose={() => {}}
            onProceed={() => {}}
          />,
          locale,
        );
        expect(await view.findByText(locale === "en" ? english : portuguese)).toBeTruthy();
        expect(result.riskLevel).toBe(risk);
      });
    }

    test(`Agent ${locale}: durations use locale without changing ledger values`, () => {
      const timeline = foldLedgerEntries([
        { kind: "event", event: { kind: "run-started", atMs: 1000, mode: "agent" } },
        { kind: "event", event: { kind: "tool-invoked", atMs: 2500, tool: "db_read", stepId: "s" } },
      ] as AgentLedgerEntry[]);
      const view = render(<AnswerCard timeline={timeline} />, locale);
      expect(view.getByTestId("agent-answer-elapsed").textContent).toContain(locale === "en" ? "1.5 s" : "1,5 s");
      expect(timeline.items[1].atMs).toBe(2500);
    });

    test(`Query Safety ${locale}: confirms/cancels without changing SQL, enums or model output`, async () => {
      const analyze = mock(async () => safety);
      const proceed = mock(() => {});
      const close = mock(() => {});
      const view = render(
        <QuerySafetyDialog
          isOpen
          query={SQL}
          schemaContext=""
          onAnalyzeSafety={analyze}
          onClose={close}
          onProceed={proceed}
        />,
        locale,
      );
      const confirm = await view.findByRole("button", {
        name: locale === "en" ? "Execute Anyway" : "Executar mesmo assim",
      });
      expect(view.container.querySelector("pre")?.textContent).toBe(SQL);
      expect(view.getByText(safety.summary)).toBeTruthy();
      expect(view.getByText(safety.warnings[0].message)).toBeTruthy();
      expect(view.getByText(RAW)).toBeTruthy();
      expect(view.getByText(safety.recommendation)).toBeTruthy();
      expect(safety.riskLevel).toBe("critical");
      expect(isDangerousQuery(SQL, "postgres")).toBe(true);
      fireEvent.click(confirm);
      fireEvent.click(view.getByRole("button", { name: locale === "en" ? "Cancel" : "Cancelar" }));
      expect(proceed).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(analyze).toHaveBeenCalledTimes(1);
    });

    test(`Query Safety ${locale}: API error and configuration key stay verbatim`, async () => {
      globalThis.fetch = mock(async () => json({ error: RAW }, 503)) as unknown as typeof fetch;
      const view = render(
        <QuerySafetyDialog isOpen query={SQL} schemaContext="" onClose={() => {}} onProceed={() => {}} />,
        locale,
      );
      expect(await view.findByText(RAW)).toBeTruthy();
    });

    test(`Query Safety ${locale}: local fallback is translated, not guessed from API text`, async () => {
      globalThis.fetch = mock(async () => json({}, 503)) as unknown as typeof fetch;
      const view = render(
        <QuerySafetyDialog isOpen query={SQL} schemaContext="" onClose={() => {}} onProceed={() => {}} />,
        locale,
      );
      expect(await view.findByText(locale === "en" ? "Analysis failed" : "Falha na análise")).toBeTruthy();
      view.unmount();
      globalThis.fetch = mock(async () => json({ error: "Analysis failed" }, 503)) as unknown as typeof fetch;
      const rawView = render(
        <QuerySafetyDialog isOpen query={SQL} schemaContext="" onClose={() => {}} onProceed={() => {}} />,
        locale,
      );
      expect(await rawView.findByText("Analysis failed")).toBeTruthy();
    });

    test(`Agent consent ${locale}: labels and callbacks keep the original decision`, () => {
      const change = mock<(next: boolean) => void>(() => {});
      const open = mock(() => {});
      const cancel = mock(() => {});
      const view = render(
        <ConsentCard
          workflowType="data-analysis"
          workflowLabel={locale === "en" ? "Analyze" : "Analisar"}
          connectionName="PostgreSQL customers"
          engine="sqlite"
          autoExecute={false}
          onAutoExecuteChange={change}
          onOpen={open}
          onCancel={cancel}
          regionRef={createRef<HTMLElement>()}
        />,
        locale,
      );
      const checkbox = view.getByRole("checkbox", {
        name:
          locale === "en" ? "Also run the final answer in my editor" : "Executar a resposta final também no meu editor",
      });
      expect((checkbox as HTMLInputElement).checked).toBe(false);
      expect(view.getByTestId("agent-consent-workflow").textContent).toContain("PostgreSQL customers");
      expect(view.getByTestId("agent-auto-execute-terms").textContent).toContain("DDL");
      expect(view.getByTestId("agent-auto-execute-sqlite").textContent).toContain("SQLite");
      fireEvent.click(checkbox);
      fireEvent.click(view.getByTestId("agent-consent-open"));
      fireEvent.click(view.getByTestId("agent-consent-cancel"));
      expect(change).toHaveBeenCalledWith(true);
      expect(open).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      view.rerender(
        <ConsentCard
          workflowType="data-analysis"
          workflowLabel="Analyze"
          connectionName="PostgreSQL customers"
          engine="sqlite"
          autoExecute
          onAutoExecuteChange={change}
          onOpen={open}
          onCancel={cancel}
          regionRef={createRef<HTMLElement>()}
        />,
      );
      expect(view.getByTestId("agent-consent-bounds").textContent).toContain(
        locale === "en" ? "no time limit" : "sem limite de tempo",
      );
    });

    test(`Agent artifact ${locale}: authored errors translate and API errors stay raw`, async () => {
      const onError = mock<(message: string) => void>(() => {});
      const onShown = mock(() => {});
      const fetchMock = mock(async () => json({}, 503));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const hook = renderHook(() => useAgentArtifact({ explainFormat: undefined, onError, onShown }), {
        wrapper: ({ children }) => <IntlTestProvider locale={locale}>{children}</IntlTestProvider>,
      });
      await act(async () => {
        await hook.result.current.show({ runId: "run-id", correlationId: "result-id" });
      });
      expect(onError).toHaveBeenLastCalledWith(
        locale === "en" ? "This result could not be read (503)" : "Não foi possível ler este resultado (503)",
      );
      expect(fetchMock).toHaveBeenCalledWith("/api/agent/runs/run-id/artifacts/result-id");
      globalThis.fetch = mock(async () => json({ error: RAW }, 503)) as unknown as typeof fetch;
      await act(async () => {
        await hook.result.current.show({ runId: "run-id", correlationId: "result-id" });
      });
      expect(onError).toHaveBeenLastCalledWith(RAW);
      expect(onShown).not.toHaveBeenCalled();
      expect(hook.result.current.artifact).toBeNull();
      hook.unmount();
    });

    test(`Agent ${locale}: start, raw content, copied Markdown and marked SQL handoff`, async () => {
      let body: Record<string, unknown> | undefined;
      const fetchMock = mock(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith("/stream"))
          return stream(
            entries()
              .map((entry) => JSON.stringify(entry))
              .join("\n"),
          );
        if (String(url) === "/api/agent/runs") body = JSON.parse(String(init?.body));
        return json({ runId: "arun_i18n" }, 202);
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const apply = mock<(sql: string) => void>(() => {});
      const execute = mock(async () => {});
      const copy = mock<(text: string) => Promise<void>>(async () => {});
      Object.defineProperty(navigator, "clipboard", { value: { writeText: copy }, configurable: true });
      const props = {
        connectionId: { id: "seed:test" },
        connectionName: "customers OpenAI",
        connectionType: "postgres" as const,
        onApplyStatement: apply,
        onRunStatement: execute,
      };
      const ui = (selected: Locale) => (
        <IntlTestProvider locale={selected}>
          <AgentRail {...props} />
        </IntlTestProvider>
      );
      const view = render(ui(locale));
      expect(view.getByTestId("agent-objective").getAttribute("placeholder")).toBe(
        locale === "en" ? "Why is checkout slow?" : "Por que a finalização da compra está lenta?",
      );
      fireEvent.change(view.getByTestId("agent-objective"), { target: { value: OBJECTIVE } });
      await act(async () => {
        fireEvent.click(view.getByTestId("agent-start"));
      });
      await view.findByTestId("agent-answer-plan");
      expect(body?.objective).toBe(OBJECTIVE);
      expect(body?.mode).toBe("planning");
      expect(Array.from(view.container.querySelectorAll("pre"), (node) => node.textContent)).toContain(OBJECTIVE);
      expect(view.getByTestId("agent-answer-statement").querySelector("pre")?.textContent).toBe(SQL);
      expect(view.getByTestId("agent-answer-why-prose").querySelector("strong")?.textContent).toBe("Model explanation");
      expect(view.getByTestId("agent-answer-why-prose").textContent).toContain('{"customer_id":7}');
      expect(view.container.textContent).toContain("gpt-test");
      const handoff = view.getByTestId("agent-answer-plan-apply");
      expect(handoff.getAttribute("aria-label")).toContain("NON_READ_STATEMENT");
      expect(handoff.getAttribute("aria-label")).toContain(handoff.textContent!.trim());
      fireEvent.click(handoff);
      fireEvent.click(view.getByTestId("agent-answer-why-copy"));
      await waitFor(() => expect(copy).toHaveBeenCalledWith(MODEL));
      expect(apply).toHaveBeenCalledWith(SQL);
      expect(execute).not.toHaveBeenCalled();
      const requests = fetchMock.mock.calls.length;
      const status = locale === "en" ? "succeeded" : "concluída";
      expect(view.getByTestId("agent-run-status").textContent).toBe(status);
      view.rerender(ui(locale === "en" ? "pt-BR" : "en"));
      expect(fetchMock.mock.calls.length).toBe(requests);
      expect(apply).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalled();
      expect(view.getByTestId("agent-answer-statement").querySelector("pre")?.textContent).toBe(SQL);
      expect(view.getByTestId("agent-run-status").textContent).not.toBe(status);
    });

    test(`Agent ${locale}: stop remains the same DELETE request, not query execution`, async () => {
      const fetchMock = mock(async (url: RequestInfo | URL) =>
        String(url).endsWith("/stream")
          ? stream(
              entries(false)
                .slice(0, 2)
                .map((entry) => JSON.stringify(entry))
                .join("\n"),
            )
          : json({ runId: "arun_i18n" }, 202),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const ui = (selected: Locale) => (
        <IntlTestProvider locale={selected}>
          <AgentRail connectionId={{ id: "seed:test" }} connectionName="customers" />
        </IntlTestProvider>
      );
      const view = render(ui(locale));
      fireEvent.change(view.getByTestId("agent-objective"), { target: { value: OBJECTIVE } });
      await act(async () => {
        fireEvent.click(view.getByTestId("agent-start"));
      });
      const stop = await view.findByTestId("agent-stop");
      expect(stop.textContent).toContain(locale === "en" ? "Stop" : "Parar");
      const requests = fetchMock.mock.calls.length;
      view.rerender(ui(locale === "en" ? "pt-BR" : "en"));
      expect(fetchMock.mock.calls.length).toBe(requests);
      expect(view.getByTestId("agent-stop").textContent).toContain(locale === "en" ? "Parar" : "Stop");
      await act(async () => {
        fireEvent.click(stop);
      });
      const calls = fetchMock.mock.calls as unknown as [RequestInfo | URL, RequestInit?][];
      expect(
        calls.filter(([url, init]) => String(url) === "/api/agent/runs/arun_i18n" && init?.method === "DELETE"),
      ).toHaveLength(1);
      expect(calls.some(([url]) => String(url).includes("/api/db/query"))).toBe(false);
    });

    test(`Agent ${locale}: local start error follows locale without retrying the request`, async () => {
      const fetchMock = mock(async () => json({}, 503));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const ui = (selected: Locale) => (
        <IntlTestProvider locale={selected}>
          <AgentRail connectionId={{ id: "seed:test" }} connectionName="customers" />
        </IntlTestProvider>
      );
      const view = render(ui(locale));
      fireEvent.change(view.getByTestId("agent-objective"), { target: { value: OBJECTIVE } });
      await act(async () => {
        fireEvent.click(view.getByTestId("agent-start"));
      });
      expect(view.getByTestId("agent-error").textContent).toBe(
        locale === "en" ? "The run could not be started (503)" : "Não foi possível iniciar a execução (503)",
      );
      const requests = fetchMock.mock.calls.length;
      view.rerender(ui(locale === "en" ? "pt-BR" : "en"));
      expect(view.getByTestId("agent-error").textContent).toBe(
        locale === "en" ? "Não foi possível iniciar a execução (503)" : "The run could not be started (503)",
      );
      expect(fetchMock.mock.calls.length).toBe(requests);
      expect((view.getByTestId("agent-objective") as HTMLTextAreaElement).value).toBe(OBJECTIVE);
    });

    test(`Agent ${locale}: raw API failure stays intact and a failed card retries once`, async () => {
      globalThis.fetch = mock(async () => json({ error: RAW }, 500)) as unknown as typeof fetch;
      const view = render(<AgentRail connectionId={{ id: "seed:test" }} connectionName="customers" />, locale);
      fireEvent.change(view.getByTestId("agent-objective"), { target: { value: OBJECTIVE } });
      await act(async () => {
        fireEvent.click(view.getByTestId("agent-start"));
      });
      expect(view.getByTestId("agent-error").textContent).toBe(RAW);
      expect((view.getByTestId("agent-objective") as HTMLTextAreaElement).value).toBe(OBJECTIVE);
      view.unmount();
      const retry = mock(() => {});
      const timeline = foldLedgerEntries([
        { kind: "event", event: { kind: "run-finished", atMs: 1, status: "failed", reason: "model-unavailable" } },
      ] as AgentLedgerEntry[]);
      const card = render(<AnswerCard timeline={timeline} onRetry={retry} />, locale);
      fireEvent.click(card.getByRole("button", { name: locale === "en" ? "Retry" : "Tentar novamente" }));
      expect(retry).toHaveBeenCalledTimes(1);
      expect(timeline.status).toBe("failed");
    });

    test(`AI EXPLAIN ${locale}: only chrome changes around streamed model output`, async () => {
      const fetchMock = mock(async () => stream(MODEL));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const load = mock<(sql: string) => void>(() => {});
      const plan = [{ Plan: { "Node Type": "Seq Scan", "Relation Name": "customers" } }];
      const ui = (selected: Locale) => (
        <IntlTestProvider locale={selected}>
          <VisualExplain plan={plan} query={SQL} onLoadQuery={load} />
        </IntlTestProvider>
      );
      const view = render(ui(locale));
      fireEvent.click(view.getByRole("button", { name: locale === "en" ? "AI EXPLAIN" : "EXPLAIN com IA" }));
      await act(async () => {
        fireEvent.click(view.getByRole("button", { name: locale === "en" ? "Analyze with AI" : "Analisar com IA" }));
      });
      expect(view.getByText('{"customer_id":7}')).toBeTruthy();
      fireEvent.click(view.getByRole("button", { name: locale === "en" ? "Try This" : "Experimentar" }));
      expect(load).toHaveBeenCalledWith(SQL);
      view.rerender(ui(locale === "en" ? "pt-BR" : "en"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(view.getByText('{"customer_id":7}')).toBeTruthy();
    });
  }

  test("Query Safety loading survives a locale switch without a second analysis", async () => {
    let finish!: (value: typeof safety) => void;
    const analyze = mock(
      () =>
        new Promise<typeof safety>((resolve) => {
          finish = resolve;
        }),
    );
    const ui = (locale: Locale) => (
      <IntlTestProvider locale={locale}>
        <QuerySafetyDialog
          isOpen
          query={SQL}
          schemaContext=""
          onAnalyzeSafety={analyze}
          onClose={() => {}}
          onProceed={() => {}}
        />
      </IntlTestProvider>
    );
    const view = render(ui("pt-BR"));
    expect(view.getByText("Verificando a segurança da consulta...")).toBeTruthy();
    view.rerender(ui("en"));
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(view.getByText("Analyzing query safety...")).toBeTruthy();
    await act(async () => {
      finish(safety);
    });
    expect(view.getByText(safety.summary)).toBeTruthy();
  });
});
