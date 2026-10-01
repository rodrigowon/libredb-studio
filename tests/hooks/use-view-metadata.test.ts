import "../setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useViewMetadata } from "@/hooks/use-view-metadata";
import type { DatabaseConnection, ViewSchema } from "@/lib/types";
import type { ViewMetadataResult } from "@/lib/view-metadata";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const connection = (id: string): DatabaseConnection => ({ id, name: id, type: "postgres", createdAt: new Date(0) });
const aConnection = connection("a");
const bConnection = connection("b");
const views = (name: string): ViewSchema[] => [{ name, ref: { namespace: "public", name }, columns: [] }];
const ready = (name: string): ViewMetadataResult => ({ status: "ready", data: views(name) });
afterEach(cleanup);

describe("views metadata ownership", () => {
  test("unsupported, idle, loading, ready empty and error are distinct", async () => {
    const pending = deferred<ViewMetadataResult>();
    const load = mock(() => pending.promise);
    const { result, rerender } = renderHook(
      ({ supported }) => useViewMetadata(aConnection, supported ? load : undefined),
      { initialProps: { supported: false } },
    );
    expect(result.current.views).toEqual({ status: "unsupported" });
    await act(async () => result.current.fetchViews(aConnection));
    expect(load).not.toHaveBeenCalled();
    rerender({ supported: true });
    expect(result.current.views).toEqual({ status: "idle" });
    let request!: Promise<void>;
    act(() => {
      request = result.current.fetchViews(aConnection);
    });
    expect(result.current.views.status).toBe("loading");
    await act(async () => {
      pending.resolve({ status: "ready", data: [] });
      await request;
    });
    expect(result.current.views).toEqual({ status: "ready", data: [] });
    load.mockRejectedValueOnce(new Error("denied"));
    await act(async () => result.current.fetchViews(aConnection));
    expect(result.current.views).toEqual({ status: "error", error: "denied", previous: [] });
  });

  test("server-discovered unsupported does not become ready empty", async () => {
    const { result } = renderHook(() => useViewMetadata(aConnection, async () => ({ status: "unsupported" })));
    await act(async () => result.current.fetchViews(aConnection));
    expect(result.current.views).toEqual({ status: "unsupported" });
  });

  for (const oldFails of [false, true]) {
    test(`stale ${oldFails ? "error" : "success"} cannot replace a newer success`, async () => {
      const a = deferred<ViewMetadataResult>();
      const b = deferred<ViewMetadataResult>();
      const load = mock(() => a.promise)
        .mockImplementationOnce(() => a.promise)
        .mockImplementationOnce(() => b.promise);
      const { result } = renderHook(() => useViewMetadata(aConnection, load));
      let old!: Promise<void>;
      let current!: Promise<void>;
      act(() => {
        old = result.current.fetchViews(aConnection);
      });
      act(() => {
        current = result.current.fetchViews(aConnection);
      });
      await act(async () => {
        b.resolve(ready("new"));
        await current;
      });
      await act(async () => {
        if (oldFails) a.reject(new Error("old"));
        else a.resolve(ready("old"));
        await old;
      });
      expect(result.current.views).toEqual(ready("new"));
    });

    test(`stale ${oldFails ? "error" : "success"} cannot end the newer loading state`, async () => {
      const a = deferred<ViewMetadataResult>();
      const b = deferred<ViewMetadataResult>();
      const load = mock(() => a.promise)
        .mockImplementationOnce(() => a.promise)
        .mockImplementationOnce(() => b.promise);
      const { result } = renderHook(() => useViewMetadata(aConnection, load));
      let old!: Promise<void>;
      let current!: Promise<void>;
      act(() => {
        old = result.current.fetchViews(aConnection);
      });
      act(() => {
        current = result.current.fetchViews(aConnection);
      });
      await act(async () => {
        if (oldFails) a.reject(new Error("old"));
        else a.resolve(ready("old"));
        await old;
      });
      expect(result.current.views.status).toBe("loading");
      await act(async () => {
        b.resolve(ready("new"));
        await current;
      });
      expect(result.current.views).toEqual(ready("new"));
    });

    test(`unmount invalidates pending ${oldFails ? "error" : "success"}`, async () => {
      const pending = deferred<ViewMetadataResult>();
      const { result, unmount } = renderHook(() => useViewMetadata(aConnection, () => pending.promise));
      let request!: Promise<void>;
      act(() => {
        request = result.current.fetchViews(aConnection);
      });
      const before = result.current.views;
      unmount();
      await act(async () => {
        if (oldFails) pending.reject(new Error("late"));
        else pending.resolve(ready("late"));
        await request;
      });
      expect(result.current.views).toBe(before);
    });
  }

  for (const fails of [false, true]) {
    test(`refresh keeps previous data through ${fails ? "error" : "success"}`, async () => {
      const pending = deferred<ViewMetadataResult>();
      const load = mock(async () => ready("first"))
        .mockImplementationOnce(async () => ready("first"))
        .mockImplementationOnce(() => pending.promise);
      const { result } = renderHook(() => useViewMetadata(aConnection, load));
      await act(async () => result.current.fetchViews(aConnection));
      let request!: Promise<void>;
      act(() => {
        request = result.current.fetchViews(aConnection);
      });
      expect(result.current.views).toEqual({ status: "loading", previous: views("first") });
      await act(async () => {
        if (fails) pending.reject(new Error("refresh denied"));
        else pending.resolve(ready("next"));
        await request;
      });
      expect(result.current.views).toEqual(
        fails ? { status: "error", error: "refresh denied", previous: views("first") } : ready("next"),
      );
    });
  }

  test("switches clear previous data; late work cannot belong to the new connection", async () => {
    const pending = deferred<ViewMetadataResult>();
    const load = mock(async () => ready("first"))
      .mockImplementationOnce(async () => ready("first"))
      .mockImplementationOnce(() => pending.promise);
    const { result, rerender } = renderHook(({ scope }) => useViewMetadata(scope, load), {
      initialProps: { scope: aConnection as DatabaseConnection | null },
    });
    await act(async () => result.current.fetchViews(aConnection));
    let request!: Promise<void>;
    act(() => {
      request = result.current.fetchViews(aConnection);
    });
    rerender({ scope: bConnection });
    expect(result.current.views).toEqual({ status: "idle" });
    await act(async () => {
      pending.resolve(ready("old"));
      await request;
    });
    expect(result.current.views).toEqual({ status: "idle" });
    await act(async () => result.current.fetchViews(bConnection));
    expect(result.current.views).toEqual(ready("first"));
    rerender({ scope: null });
    expect(result.current.views).toEqual({ status: "idle" });
    await act(async () => result.current.fetchViews(bConnection));
    expect(load).toHaveBeenCalledTimes(3);
  });

  test("standalone same-ID replacement invalidates the old object's request", async () => {
    const pending = deferred<ViewMetadataResult>();
    const replacement = { ...aConnection, database: "changed" };
    const load = mock(() => pending.promise);
    const { result, rerender } = renderHook(({ scope }) => useViewMetadata(scope, load), {
      initialProps: { scope: aConnection },
    });
    let request!: Promise<void>;
    act(() => {
      request = result.current.fetchViews(aConnection);
    });
    rerender({ scope: replacement });
    await act(async () => {
      pending.resolve(ready("old"));
      await request;
    });
    expect(result.current.views).toEqual({ status: "idle" });
    await act(async () => result.current.fetchViews(aConnection));
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("removing support invalidates pending work and clears previous data", async () => {
    const pending = deferred<ViewMetadataResult>();
    const load = mock(() => pending.promise);
    const { result, rerender } = renderHook(({ supported }) => useViewMetadata("a", supported ? load : undefined), {
      initialProps: { supported: true },
    });
    let request!: Promise<void>;
    act(() => {
      request = result.current.fetchViews(aConnection);
    });
    rerender({ supported: false });
    await act(async () => {
      pending.resolve(ready("old"));
      await request;
    });
    expect(result.current.views).toEqual({ status: "unsupported" });
  });
});
