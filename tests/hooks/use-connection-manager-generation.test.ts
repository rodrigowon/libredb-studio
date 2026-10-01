import "../setup-dom";
import { mockToastError } from "../helpers/mock-sonner";
import "../helpers/mock-navigation";

import { afterEach, beforeEach, describe, expect, test, spyOn } from "bun:test";
import { useEffect } from "react";
import { act, renderHook } from "@testing-library/react";
import { IntlTestProvider } from "../helpers/render-with-intl";
import { mockGlobalFetch, restoreGlobalFetch, type MockFetchResponse } from "../helpers/mock-fetch";
import { useConnectionManager } from "@/hooks/use-connection-manager";
import { logger } from "@/lib/logger";
import type { DatabaseConnection, TableSchema, TableRelations } from "@/lib/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const connection = (id = "a", database = id): DatabaseConnection => ({
  id,
  database,
  name: id,
  type: "postgres",
  createdAt: new Date(0),
});
const schema = (rowCount: number): TableSchema[] => [{ name: "shared", columns: [], indexes: [], rowCount }];
const relations: TableRelations[] = [
  {
    name: "shared",
    foreignKeys: [{ columnName: "parent_id", referencedTable: "parent", referencedColumn: "id" }],
    indexes: [{ name: "shared_idx", columns: ["parent_id"], unique: false }],
  },
];
const response = (rows: TableSchema[]): MockFetchResponse => ({ json: rows });
type PendingList = ReturnType<typeof deferred<MockFetchResponse>>;

function installLists(lists: PendingList[], enrichment?: PendingList) {
  return mockGlobalFetch({
    "/api/db/schema/list": () => {
      const next = lists.shift();
      if (!next) throw new Error("Unexpected schema load");
      return next.promise;
    },
    "/api/db/schema/relations": () => enrichment?.promise ?? { json: [] },
    "/api/db/health": { json: {} },
  });
}

function mountManager() {
  return renderHook(() => useConnectionManager(), { wrapper: IntlTestProvider });
}

beforeEach(() => mockToastError.mockClear());
afterEach(restoreGlobalFetch);

describe("standalone schema generations", () => {
  for (const [oldFails, newFails] of [
    [false, false],
    [true, false],
    [false, true],
  ] as const) {
    test(`same-connection refresh: old ${oldFails ? "error" : "success"} after new ${newFails ? "error" : "success"}`, async () => {
      const a = deferred<MockFetchResponse>();
      const b = deferred<MockFetchResponse>();
      const fetchMock = installLists([a, b]);
      const { result } = mountManager();
      let old!: Promise<void>;
      let current!: Promise<void>;
      act(() => {
        old = result.current.fetchSchema(connection());
      });
      act(() => {
        current = result.current.fetchSchema(connection());
      });
      await act(async () => {
        if (newFails) b.reject(new Error("current failure"));
        else b.resolve(response(schema(2)));
        await current;
      });
      const expected = newFails ? [] : schema(2);
      expect(result.current.schema).toEqual(expected);
      expect(result.current.schemaError).toBe(newFails ? "current failure" : null);
      await act(async () => {
        if (oldFails) a.reject(new Error("obsolete failure"));
        else a.resolve(response(schema(1)));
        await old;
      });
      expect(result.current.schema).toEqual(expected);
      expect(result.current.schemaError).toBe(newFails ? "current failure" : null);
      expect(result.current.isLoadingSchema).toBe(false);
      expect(mockToastError).toHaveBeenCalledTimes(newFails ? 1 : 0);
      // An obsolete list must not even initiate relations enrichment.
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/relations"))).toHaveLength(newFails ? 0 : 1);
    });
  }

  for (const oldFails of [false, true]) {
    test(`obsolete ${oldFails ? "catch" : "success"}/finally cannot clear loading for a pending refresh`, async () => {
      const a = deferred<MockFetchResponse>();
      const b = deferred<MockFetchResponse>();
      installLists([a, b]);
      const { result } = mountManager();
      let old!: Promise<void>;
      let current!: Promise<void>;
      act(() => {
        old = result.current.fetchSchema(connection());
      });
      act(() => {
        current = result.current.fetchSchema(connection());
      });
      await act(async () => {
        if (oldFails) a.reject(new Error("obsolete failure"));
        else a.resolve(response(schema(1)));
        await old;
      });
      expect(result.current.isLoadingSchema).toBe(true);
      expect(result.current.schema).toEqual([]);
      expect(result.current.schemaError).toBeNull();
      expect(mockToastError).not.toHaveBeenCalled();
      await act(async () => {
        b.resolve(response(schema(2)));
        await current;
      });
      expect(result.current.schema).toEqual(schema(2));
      expect(result.current.isLoadingSchema).toBe(false);
    });
  }

  for (const sameId of [false, true]) {
    test(`${sameId ? "same-ID object edit" : "connection switch"} triggers a new load and invalidates old work`, async () => {
      const a = deferred<MockFetchResponse>();
      const b = deferred<MockFetchResponse>();
      const fetchMock = installLists([a, b]);
      const { result } = renderHook(
        () => {
          const manager = useConnectionManager();
          useEffect(() => {
            if (manager.activeConnection) void manager.fetchSchema(manager.activeConnection);
            // eslint-disable-next-line react-hooks/exhaustive-deps -- Reproduce Studio's existing object-based trigger, not the whole returned object.
          }, [manager.activeConnection]); // Mirrors Studio's existing object-based trigger.
          return manager;
        },
        { wrapper: IntlTestProvider },
      );
      act(() => {
        result.current.setActiveConnection(connection());
      });
      act(() => {
        result.current.setActiveConnection(connection(sameId ? "a" : "b", "edited"));
      });
      await act(async () => {
        b.resolve(response(schema(2)));
        await b.promise;
      });
      await act(async () => {
        a.resolve(response(schema(1)));
        await a.promise;
      });
      expect(result.current.schema).toEqual(schema(2));
      expect(result.current.isLoadingSchema).toBe(false);
      const bodies = fetchMock.mock.calls
        .filter(([url]) => String(url).endsWith("/list"))
        .map(([, init]) => JSON.parse(String(init?.body)).database);
      expect(bodies).toEqual(["a", "edited"]);
    });
  }

  test("clearing the active connection invalidates a pending list without another request", async () => {
    const a = deferred<MockFetchResponse>();
    installLists([a]);
    const { result } = mountManager();
    act(() => {
      result.current.setActiveConnection(connection());
    });
    let old!: Promise<void>;
    act(() => {
      old = result.current.fetchSchema(connection());
    });
    act(() => {
      result.current.setActiveConnection(null);
      result.current.setSchema([]);
    });
    expect(result.current.isLoadingSchema).toBe(false);
    await act(async () => {
      a.resolve(response(schema(1)));
      await old;
    });
    expect(result.current.schema).toEqual([]);
  });

  for (const failure of [false, true]) {
    test(`late list ${failure ? "error" : "success"} after unmount has no toast/enrichment`, async () => {
      const a = deferred<MockFetchResponse>();
      const fetchMock = installLists([a]);
      const { result, unmount } = mountManager();
      let old!: Promise<void>;
      act(() => {
        old = result.current.fetchSchema(connection());
      });
      unmount();
      if (failure) a.reject(new Error("unmounted failure"));
      else a.resolve(response(schema(1)));
      await old;
      expect(mockToastError).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls).toHaveLength(1);
    });
  }

  test("an obsolete HTTP error body finishing late is ignored", async () => {
    const body = deferred<{ error: string }>();
    const fetchMock = installLists([deferred<MockFetchResponse>()]);
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: () => body.promise }) as Response);
    const { result } = mountManager();
    let old!: Promise<void>;
    act(() => {
      old = result.current.fetchSchema(connection());
    });
    // Advance explicitly through the fetch await, leaving the error-body read pending.
    await act(async () => {
      await Promise.resolve();
    });
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(schema(2))));
    await act(async () => {
      await result.current.fetchSchema(connection());
    });
    await act(async () => {
      body.resolve({ error: "late HTTP failure" });
      await old;
    });
    expect(result.current.schema).toEqual(schema(2));
    expect(result.current.schemaError).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("PostgreSQL enrichment belongs to the list generation", () => {
  for (const sameConnection of [false, true]) {
    test(`old enrichment cannot merge into ${sameConnection ? "a newer refresh" : "another connection"}'s homonymous table`, async () => {
      const a = deferred<MockFetchResponse>();
      const b = deferred<MockFetchResponse>();
      const enrichment = deferred<MockFetchResponse>();
      installLists([a, b], enrichment);
      const { result } = mountManager();
      act(() => {
        result.current.setActiveConnection(connection());
      });
      let old!: Promise<void>;
      let current!: Promise<void>;
      act(() => {
        old = result.current.fetchSchema(connection());
      });
      await act(async () => {
        a.resolve(response(schema(1)));
        await a.promise;
      });
      expect(result.current.schema).toEqual(schema(1));
      expect(result.current.isLoadingSchema).toBe(false); // Relations never block the list.
      if (!sameConnection)
        act(() => {
          result.current.setActiveConnection(connection("b"));
        });
      // The current generation's enrichment is empty and completes independently.
      mockGlobalFetch({
        "/api/db/schema/list": () => b.promise,
        "/api/db/schema/relations": { json: [] },
      });
      act(() => {
        current = result.current.fetchSchema(connection(sameConnection ? "a" : "b"));
      });
      await act(async () => {
        b.resolve(response(schema(2)));
        await current;
      });
      await act(async () => {
        enrichment.resolve({ json: relations });
        await old;
      });
      expect(result.current.schema).toEqual(schema(2));
    });
  }

  test("current enrichment still applies normally", async () => {
    const list = deferred<MockFetchResponse>();
    const enrichment = deferred<MockFetchResponse>();
    installLists([list], enrichment);
    const { result } = mountManager();
    let current!: Promise<void>;
    act(() => {
      current = result.current.fetchSchema(connection());
    });
    await act(async () => {
      list.resolve(response(schema(2)));
      await list.promise;
    });
    expect(result.current.isLoadingSchema).toBe(false);
    await act(async () => {
      enrichment.resolve({ json: relations });
      await current;
    });
    expect(result.current.schema).toEqual([
      { ...schema(2)[0], foreignKeys: relations[0].foreignKeys, indexes: relations[0].indexes },
    ]);
  });

  test("obsolete enrichment errors after unmount are not logged", async () => {
    const list = deferred<MockFetchResponse>();
    const enrichment = deferred<MockFetchResponse>();
    installLists([list], enrichment);
    const log = spyOn(logger, "error").mockImplementation(() => {});
    try {
      const { result, unmount } = mountManager();
      let old!: Promise<void>;
      act(() => {
        old = result.current.fetchSchema(connection());
      });
      await act(async () => {
        list.resolve(response(schema(1)));
        await list.promise;
      });
      unmount();
      enrichment.reject(new Error("obsolete relations failure"));
      await old;
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
