import "../setup-dom";
import "../helpers/mock-sonner";
import "../helpers/mock-navigation";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { IntlTestProvider } from "../helpers/render-with-intl";
import { mockGlobalFetch, restoreGlobalFetch } from "../helpers/mock-fetch";
import { useConnectionManager } from "@/hooks/use-connection-manager";
import { useConnectionAdapter } from "@/workspace/hooks/use-connection-adapter";
import type { TableSchema, ViewSchema } from "@/lib/types";
import type { WorkspaceConnection } from "@/workspace/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const connections: WorkspaceConnection[] = [
  { id: "a", name: "A", type: "postgres" },
  { id: "b", name: "B", type: "postgres" },
];
const tables: TableSchema[] = [{ name: "table_only", columns: [], indexes: [] }];
const views = (name: string): ViewSchema[] => [{ name, ref: { namespace: "public", name }, columns: [] }];
const onSchemaFetch = async () => tables;
afterEach(() => {
  cleanup();
  restoreGlobalFetch();
});

function mount(mode: "standalone" | "embedded", reader: (id: string) => Promise<ViewSchema[]>) {
  const fetch = mockGlobalFetch({
    "/api/db/schema/views": async () => ({ json: { status: "ready", data: await reader("a") } }),
    "/api/db/schema/list": { json: tables },
    "/api/db/schema/relations": { json: [] },
    "/api/db/health": { json: {} },
  });
  const hook =
    mode === "standalone"
      ? renderHook(() => useConnectionManager(), { wrapper: IntlTestProvider })
      : renderHook(() => useConnectionAdapter({ connections, onSchemaFetch, onViewsFetch: reader }));
  if (mode === "standalone") {
    act(() => hook.result.current.setActiveConnection({ ...connections[0], createdAt: new Date(0) }));
  }
  return { ...hook, fetch };
}

for (const mode of ["standalone", "embedded"] as const) {
  describe(`${mode} views integration`, () => {
    for (const data of [[], views("view_only")]) {
      test(`${data.length ? "populated" : "empty"} views stay separate from tables and context`, async () => {
        const pending = deferred<ViewSchema[]>();
        const reader = mock(() => pending.promise);
        const { result } = mount(mode, reader);
        expect(result.current.views.status).toBe("idle");
        await act(async () => result.current.fetchSchema(result.current.activeConnection!));
        let request!: Promise<void>;
        act(() => {
          request = result.current.fetchViews(result.current.activeConnection!);
        });
        expect(result.current.views.status).toBe("loading");
        expect(result.current.schema).toEqual(tables);
        await act(async () => {
          pending.resolve(data);
          await request;
        });
        expect(result.current.views).toEqual({ status: "ready", data });
        expect(result.current.schema).toEqual(tables);
        expect(JSON.parse(result.current.schemaContext)).toEqual(tables);
      });
    }

    test("view error cannot clear tables or prevent relations enrichment", async () => {
      const { result } = mount(mode, async () => {
        throw new Error("view denied");
      });
      await act(async () =>
        Promise.all([
          result.current.fetchSchema(result.current.activeConnection!),
          result.current.fetchViews(result.current.activeConnection!),
        ]),
      );
      expect(result.current.views).toMatchObject({ status: "error", error: "view denied" });
      expect(result.current.schema).toEqual(tables);
      expect(result.current.isLoadingSchema).toBe(false);
    });

    for (const oldFails of [false, true]) {
      test(`old ${oldFails ? "error" : "success"} cannot replace newer views`, async () => {
        const a = deferred<ViewSchema[]>();
        const b = deferred<ViewSchema[]>();
        const reader = mock(() => a.promise)
          .mockImplementationOnce(() => a.promise)
          .mockImplementationOnce(() => b.promise);
        const { result } = mount(mode, reader);
        let old!: Promise<void>;
        let current!: Promise<void>;
        act(() => {
          old = result.current.fetchViews(result.current.activeConnection!);
        });
        act(() => {
          current = result.current.fetchViews(result.current.activeConnection!);
        });
        await act(async () => {
          b.resolve(views("new"));
          await current;
        });
        await act(async () => {
          if (oldFails) a.reject(new Error("late"));
          else a.resolve(views("old"));
          await old;
        });
        expect(result.current.views).toEqual({ status: "ready", data: views("new") });
      });
    }

    test("connection switch discards previous views and invalidates pending work", async () => {
      const pending = deferred<ViewSchema[]>();
      const reader = mock(async () => views("first"))
        .mockImplementationOnce(async () => views("first"))
        .mockImplementationOnce(() => pending.promise);
      const { result } = mount(mode, reader);
      await act(async () => result.current.fetchViews(result.current.activeConnection!));
      let request!: Promise<void>;
      act(() => {
        request = result.current.fetchViews(result.current.activeConnection!);
      });
      act(() => result.current.setActiveConnection({ ...connections[1], createdAt: new Date(0) }));
      expect(result.current.views).toEqual({ status: "idle" });
      await act(async () => {
        pending.resolve(views("old"));
        await request;
      });
      expect(result.current.views).toEqual({ status: "idle" });
    });
  });
}

test("standalone uses the existing managed seed payload and reports unsupported", async () => {
  const fetch = mockGlobalFetch({
    "/api/db/schema/views": { json: { status: "unsupported" } },
    "/api/db/health": { json: {} },
  });
  const { result } = renderHook(() => useConnectionManager(), { wrapper: IntlTestProvider });
  act(() =>
    result.current.setActiveConnection({ ...connections[0], managed: true, seedId: "demo", createdAt: new Date(0) }),
  );
  await act(async () => result.current.fetchViews(result.current.activeConnection!));
  expect(result.current.views).toEqual({ status: "unsupported" });
  const call = fetch.mock.calls.find(([url]) => String(url).endsWith("/views"));
  expect(JSON.parse(call?.[1]?.body as string)).toEqual({ connectionId: "seed:demo" });
});

test("legacy embedded host without onViewsFetch is unsupported and still loads tables", async () => {
  const { result } = renderHook(() => useConnectionAdapter({ connections, onSchemaFetch }));
  expect(result.current.views).toEqual({ status: "unsupported" });
  await act(async () =>
    Promise.all([
      result.current.fetchSchema(result.current.activeConnection!),
      result.current.fetchViews(result.current.activeConnection!),
    ]),
  );
  expect(result.current.schema).toEqual(tables);
  expect(result.current.views).toEqual({ status: "unsupported" });
});

test("embedded new same-ID host load supersedes the old callback; prop changes alone do not reload", async () => {
  const a = deferred<ViewSchema[]>();
  const b = deferred<ViewSchema[]>();
  const readerA = mock(() => a.promise);
  const readerB = mock(() => b.promise);
  const { result, rerender } = renderHook(
    ({ list, reader }) => useConnectionAdapter({ connections: list, onSchemaFetch, onViewsFetch: reader }),
    { initialProps: { list: connections, reader: readerA } },
  );
  let old!: Promise<void>;
  let current!: Promise<void>;
  act(() => {
    old = result.current.fetchViews(result.current.activeConnection!);
  });
  rerender({ list: connections.map((conn) => ({ ...conn, name: `${conn.name} renamed` })), reader: readerB });
  expect(readerB).not.toHaveBeenCalled();
  act(() => {
    current = result.current.fetchViews(result.current.activeConnection!);
  });
  await act(async () => {
    b.resolve(views("new host"));
    await current;
  });
  await act(async () => {
    a.resolve(views("old host"));
    await old;
  });
  expect(readerB).toHaveBeenCalledWith("a");
  expect(result.current.views).toEqual({ status: "ready", data: views("new host") });
});
