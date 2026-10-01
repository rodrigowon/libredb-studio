import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createMockRequest, parseResponseJSON } from "../../helpers/mock-next";
import { createMockProvider } from "../../helpers/mock-provider";
import { clearRateLimitState } from "@/lib/api/rate-limit";
import type { ViewSchema } from "@/lib/types";
import type { ViewMetadataResult } from "@/lib/view-metadata";
import { QueryError } from "@/lib/db/errors";

const provider = createMockProvider();
const getProvider = mock(async () => provider);
const getSession = mock(async (): Promise<unknown> => ({ role: "admin", username: "views-test" }));
mock.module("@/lib/db", () => ({ getOrCreateProvider: getProvider }));
mock.module("@/lib/auth", () => ({ getSession }));
class SeedConnectionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}
const connection = { id: "test", name: "Test", type: "postgres" };
const resolve = mock(async (body: Record<string, unknown>, _session: unknown) => {
  void _session; // Keep the real resolver's signature for session-forwarding assertions.
  if (body.connectionId === "seed:missing") throw new SeedConnectionError("Missing managed connection", 403);
  return body.connectionId ? connection : (body.connection as typeof connection);
});
mock.module("@/lib/seed/resolve-connection", () => ({ resolveConnection: resolve, SeedConnectionError }));
const { POST } = await import("@/app/api/db/schema/views/route");
const request = (body: unknown = connection) => createMockRequest("/api/db/schema/views", { method: "POST", body });
const rateMax = process.env.RATE_LIMIT_QUERY_MAX;
beforeEach(() => {
  clearRateLimitState();
  getProvider.mockClear();
  resolve.mockClear();
  getSession.mockReset();
  getSession.mockResolvedValue({ role: "admin", username: "views-test" });
  delete provider.getViews;
});
afterEach(() => {
  if (rateMax === undefined) delete process.env.RATE_LIMIT_QUERY_MAX;
  else process.env.RATE_LIMIT_QUERY_MAX = rateMax;
});

describe("POST /api/db/schema/views", () => {
  for (const data of [
    [],
    [{ name: ' a.b" ', ref: { namespace: "库存", name: ' a.b" ' }, columns: [] }],
  ] as ViewSchema[][]) {
    test(`supported ${data.length ? "raw identity" : "empty inventory"} is ready`, async () => {
      provider.getViews = mock(async () => data);
      const response = await POST(request() as never);
      expect(response.status).toBe(200);
      expect(await parseResponseJSON<ViewMetadataResult>(response)).toEqual({ status: "ready", data });
      expect(provider.getViews).toHaveBeenCalledTimes(1);
    });
  }
  test("missing provider method is unsupported, not ready empty", async () => {
    const response = await POST(request() as never);
    expect(response.status).toBe(200);
    expect(await parseResponseJSON<ViewMetadataResult>(response)).toEqual({ status: "unsupported" });
    expect(provider.getSchema).not.toHaveBeenCalled();
  });
  test("provider failures follow existing error mapping", async () => {
    provider.getViews = mock(async () => {
      throw new QueryError("catalog denied", "postgres");
    });
    const response = await POST(request() as never);
    expect(response.status).toBe(400);
    expect(await parseResponseJSON(response)).toMatchObject({ error: "catalog denied" });
  });
  test("authentication runs before connection resolution", async () => {
    getSession.mockResolvedValueOnce(null);
    const response = await POST(request() as never);
    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
    expect(getProvider).not.toHaveBeenCalled();
  });
  test("query rate limiting runs before provider work", async () => {
    process.env.RATE_LIMIT_QUERY_MAX = "1";
    await POST(request() as never);
    const response = await POST(request() as never);
    expect(response.status).toBe(429);
    expect(getProvider).toHaveBeenCalledTimes(1);
  });
  test("managed references use existing session-bound connection resolution", async () => {
    await POST(request({ connectionId: "seed:demo", sql: "SELECT forbidden" }) as never);
    expect(resolve).toHaveBeenCalledWith(
      { connectionId: "seed:demo", sql: "SELECT forbidden" },
      { role: "admin", username: "views-test" },
    );
    expect(getProvider).toHaveBeenCalledWith(connection);
    expect(provider.query).not.toHaveBeenCalled();
    expect((await POST(request({ connectionId: "seed:missing" }) as never)).status).toBe(403);
  });
  test("bare and wrapped connections retain existing conventions", async () => {
    await POST(request() as never);
    await POST(request({ connection }) as never);
    expect(resolve.mock.calls.map(([body]) => body)).toEqual([{ connection }, { connection }]);
  });
  test("malformed, empty or missing-type configuration is rejected", async () => {
    expect(
      (await POST(new Request("http://localhost/api/db/schema/views", { method: "POST", body: "{" }) as never)).status,
    ).toBe(400);
    expect((await POST(request({}) as never)).status).toBe(400);
    expect((await POST(request({ connection: { id: "no-type" } }) as never)).status).toBe(400);
    expect(getProvider).not.toHaveBeenCalled();
  });
});
