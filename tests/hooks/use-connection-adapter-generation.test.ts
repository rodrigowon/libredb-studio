import "../setup-dom";

import { describe, expect, mock, test } from "bun:test";
import { StrictMode, useEffect } from "react";
import { act, renderHook } from "@testing-library/react";
import { useConnectionAdapter } from "@/workspace/hooks/use-connection-adapter";
import type { TableSchema } from "@/lib/types";
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
const schema = (rowCount: number): TableSchema[] => [{ name: "shared", columns: [], indexes: [], rowCount }];

describe("embedded schema generations", () => {
  for (const [oldFails, newFails] of [
    [false, false],
    [true, false],
    [false, true],
  ] as const) {
    test(`same-ID refresh: old ${oldFails ? "error" : "success"} after new ${newFails ? "error" : "success"}`, async () => {
      const a = deferred<TableSchema[]>();
      const b = deferred<TableSchema[]>();
      const onSchemaFetch = mock<(connectionId: string) => Promise<TableSchema[]>>(() => a.promise)
        .mockImplementationOnce(() => a.promise)
        .mockImplementationOnce(() => b.promise);
      const { result } = renderHook(() => useConnectionAdapter({ connections, onSchemaFetch }));
      let old!: Promise<void>;
      let current!: Promise<void>;
      act(() => {
        old = result.current.fetchSchema(result.current.activeConnection!);
      });
      act(() => {
        current = result.current.fetchSchema(result.current.activeConnection!);
      });
      await act(async () => {
        if (newFails) b.reject(new Error("current failure"));
        else b.resolve(schema(2));
        await current;
      });
      await act(async () => {
        if (oldFails) a.reject(new Error("obsolete failure"));
        else a.resolve(schema(1));
        await old;
      });
      expect(result.current.schema).toEqual(newFails ? [] : schema(2));
      expect(result.current.isLoadingSchema).toBe(false);
      expect(onSchemaFetch.mock.calls).toEqual([["a"], ["a"]]);
    });
  }

  for (const oldFails of [false, true]) {
    test(`obsolete ${oldFails ? "error" : "success"}/finally cannot clear the new callback's loading`, async () => {
      const a = deferred<TableSchema[]>();
      const b = deferred<TableSchema[]>();
      const onSchemaFetch = mock(() => a.promise)
        .mockImplementationOnce(() => a.promise)
        .mockImplementationOnce(() => b.promise);
      const { result } = renderHook(() => useConnectionAdapter({ connections, onSchemaFetch }));
      let old!: Promise<void>;
      let current!: Promise<void>;
      act(() => {
        old = result.current.fetchSchema(result.current.activeConnection!);
      });
      act(() => {
        current = result.current.fetchSchema(result.current.activeConnection!);
      });
      await act(async () => {
        if (oldFails) a.reject(new Error("obsolete failure"));
        else a.resolve(schema(1));
        await old;
      });
      expect(result.current.isLoadingSchema).toBe(true);
      expect(result.current.schema).toEqual([]);
      await act(async () => {
        b.resolve(schema(2));
        await current;
      });
      expect(result.current.schema).toEqual(schema(2));
      expect(result.current.isLoadingSchema).toBe(false);
    });
  }

  test("the Workspace ID-based trigger discards a previous connection's response", async () => {
    const a = deferred<TableSchema[]>();
    const b = deferred<TableSchema[]>();
    const onSchemaFetch = mock((id: string) => (id === "a" ? a.promise : b.promise));
    const { result } = renderHook(() => {
      const adapter = useConnectionAdapter({ connections, onSchemaFetch });
      useEffect(() => {
        if (adapter.activeConnection) void adapter.fetchSchema(adapter.activeConnection);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Reproduce the shipped Workspace ID-only trigger.
      }, [adapter.activeConnection?.id]); // Mirrors StudioWorkspace's unchanged trigger.
      return adapter;
    });
    act(() => {
      result.current.setActiveConnection(result.current.connections[1]);
    });
    await act(async () => {
      b.resolve(schema(2));
      await b.promise;
    });
    await act(async () => {
      a.resolve(schema(1));
      await a.promise;
    });
    expect(result.current.schema).toEqual(schema(2));
    expect(result.current.isLoadingSchema).toBe(false);
    expect(onSchemaFetch.mock.calls).toEqual([["a"], ["b"]]);
  });

  test("removing all host connections invalidates work even without a replacement load", async () => {
    const a = deferred<TableSchema[]>();
    const onSchemaFetch = mock(() => a.promise);
    const { result, rerender } = renderHook(
      ({ items }) => useConnectionAdapter({ connections: items, onSchemaFetch }),
      {
        initialProps: { items: connections },
      },
    );
    let old!: Promise<void>;
    act(() => {
      old = result.current.fetchSchema(result.current.activeConnection!);
    });
    rerender({ items: [] });
    expect(result.current.activeConnection).toBeNull();
    expect(result.current.isLoadingSchema).toBe(false);
    await act(async () => {
      a.resolve(schema(1));
      await old;
    });
    expect(result.current.schema).toEqual([]);
  });

  test("a same-ID host change still requires an explicit refresh; that refresh gets a new generation", async () => {
    const a = deferred<TableSchema[]>();
    const b = deferred<TableSchema[]>();
    const onSchemaFetch = mock(() => a.promise)
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);
    const { result, rerender } = renderHook(
      ({ items }) => {
        const adapter = useConnectionAdapter({ connections: items, onSchemaFetch });
        useEffect(() => {
          if (adapter.activeConnection) void adapter.fetchSchema(adapter.activeConnection);
          // eslint-disable-next-line react-hooks/exhaustive-deps -- Same-ID host changes deliberately do not trigger the shipped effect.
        }, [adapter.activeConnection?.id]);
        return adapter;
      },
      { initialProps: { items: connections } },
    );
    rerender({ items: [{ ...connections[0], name: "Renamed A" }, connections[1]] });
    expect(result.current.activeConnection!.name).toBe("Renamed A");
    expect(onSchemaFetch).toHaveBeenCalledTimes(1);
    let current!: Promise<void>;
    act(() => {
      current = result.current.fetchSchema(result.current.activeConnection!);
    });
    await act(async () => {
      b.resolve(schema(2));
      await current;
    });
    await act(async () => {
      a.resolve(schema(1));
      await a.promise;
    });
    expect(result.current.schema).toEqual(schema(2));
  });

  for (const failure of [false, true]) {
    test(`late ${failure ? "error" : "success"} after unmount cannot update the last rendered snapshot`, async () => {
      const pending = deferred<TableSchema[]>();
      const onSchemaFetch = mock(() => pending.promise);
      const { result, unmount } = renderHook(() => useConnectionAdapter({ connections, onSchemaFetch }));
      let request!: Promise<void>;
      act(() => {
        request = result.current.fetchSchema(result.current.activeConnection!);
      });
      const snapshot = result.current;
      unmount();
      if (failure) pending.reject(new Error("unmounted failure"));
      else pending.resolve(schema(1));
      await request;
      expect(result.current).toBe(snapshot);
      expect(result.current.schema).toEqual([]);
    });
  }

  test("StrictMode effect replay invalidates the first load but permits the current load", async () => {
    const a = deferred<TableSchema[]>();
    const b = deferred<TableSchema[]>();
    const onSchemaFetch = mock(() => a.promise)
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);
    const { result } = renderHook(
      () => {
        const adapter = useConnectionAdapter({ connections, onSchemaFetch });
        useEffect(() => {
          void adapter.fetchSchema(adapter.activeConnection!);
          // eslint-disable-next-line react-hooks/exhaustive-deps -- StrictMode replays the same ID-only shell trigger.
        }, [adapter.activeConnection?.id]);
        return adapter;
      },
      { wrapper: StrictMode },
    );
    expect(onSchemaFetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      b.resolve(schema(2));
      await b.promise;
    });
    await act(async () => {
      a.resolve(schema(1));
      await a.promise;
    });
    expect(result.current.schema).toEqual(schema(2));
    expect(result.current.isLoadingSchema).toBe(false);
  });
});
