import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { ErrorCodes } from "../src/utils/errors";
import type { ProjectInfo } from "../src/types";

const projectInfo: ProjectInfo = {
  id: 123,
  organizationId: 1,
  name: "Test Project",
  description: null,
  sourceLocale: "en",
} as ProjectInfo;

/**
 * A response whose headers arrive at once but whose body takes `bodyMs` to
 * stream. The body rejects with AbortError when the request signal aborts,
 * which is what `fetch` does for a body still in transfer.
 */
function slowBody(body: unknown, bodyMs: number) {
  return (_url: unknown, init?: RequestInit) => {
    const signal = init!.signal!;
    const read = () =>
      new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => resolve(body), bodyMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: read,
      text: async () => JSON.stringify(await read()),
    } as unknown as Response);
  };
}

describe("ApiClient request timeout covers the response body", () => {
  let fetchMock: MockedFunction<typeof fetch>;
  let client: ApiClient;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
    client = new ApiClient({
      apiKey: "k",
      apiBaseUrl: "https://api.test.com",
      timeout: 20,
      commitTimeout: 20,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("times out a GET whose body stalls past the budget", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response)
      .mockImplementationOnce(slowBody({ keys: {} }, 140));

    const assertion = expect(client.fetchSchema()).rejects.toMatchObject({
      message: "Request timeout after 20ms",
      code: ErrorCodes.API_TIMEOUT,
    });
    void assertion.catch(() => {});
    await vi.advanceTimersByTimeAsync(200);

    await assertion;
    // A body timeout is not retried into a second attempt that could stall again.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out the commit POST whose body stalls, without retrying it", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response)
      .mockImplementationOnce(slowBody({ success: true, stats: {} }, 140));

    const assertion = expect(
      client.pushTranslations({
        translations: { en: { default: { a: "A" } } },
        forceMode: "override",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Push timed out after 20ms"),
      code: ErrorCodes.API_TIMEOUT,
    });
    void assertion.catch(() => {});
    await vi.advanceTimersByTimeAsync(200);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still resolves a body that arrives inside the budget", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response)
      .mockImplementationOnce(slowBody({ keys: {} }, 5));

    const settled = expect(client.fetchSchema()).resolves.toEqual({ keys: {} });
    void settled.catch(() => {});
    await vi.advanceTimersByTimeAsync(10);

    await settled;
  });
});

/**
 * A non-2xx response whose headers arrive at once and whose body never ends.
 * `cancel` is the only way the client can tell the transport to let it go.
 */
function stalledBodyResponse(
  status: number,
  headers: Record<string, string> = {},
  cancel: () => void | Promise<void> = vi.fn(),
) {
  const body = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel });
  const response = new Response(body, { status, headers });
  return { response, cancel: cancel as ReturnType<typeof vi.fn> };
}

describe("ApiClient cancels response bodies it does not read", () => {
  let fetchMock: MockedFunction<typeof fetch>;
  let client: ApiClient;

  beforeEach(() => {
    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
    client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com", timeout: 1000 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cancels the stalled body of each retried 503 before the next attempt", async () => {
    const first = stalledBodyResponse(503, { "Retry-After": "0" });
    const second = stalledBodyResponse(503, { "Retry-After": "0" });
    fetchMock
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response)
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response);

    await expect(client.validateApiKey()).resolves.toEqual(projectInfo);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(second.cancel).toHaveBeenCalledTimes(1);
    // Cancelled before the next request starts, not abandoned and cancelled later.
    expect(first.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[1],
    );
    expect(second.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[2],
    );
  });

  it("still retries when cancelling a body rejects", async () => {
    const first = stalledBodyResponse(503, { "Retry-After": "0" }, () =>
      Promise.reject(new Error("socket already closed")),
    );
    fetchMock
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response);

    await expect(client.validateApiKey()).resolves.toEqual(projectInfo);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still reports a 401 when cancelling its body rejects", async () => {
    const stalled = stalledBodyResponse(401, {}, () =>
      Promise.reject(new Error("socket already closed")),
    );
    fetchMock.mockResolvedValueOnce(stalled.response);

    await expect(client.validateApiKey()).rejects.toMatchObject({
      code: ErrorCodes.API_AUTH_FAILED,
    });
  });

  it("cancels the body of a 401 without retrying", async () => {
    const stalled = stalledBodyResponse(401);
    fetchMock.mockResolvedValueOnce(stalled.response);

    await expect(client.validateApiKey()).rejects.toMatchObject({
      code: ErrorCodes.API_AUTH_FAILED,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stalled.cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels the body of a command-specific 403 without retrying", async () => {
    const project = { ok: true, json: async () => projectInfo } as Response;
    const stalled = stalledBodyResponse(403);
    fetchMock.mockResolvedValueOnce(project).mockResolvedValueOnce(stalled.response);

    await expect(client.fetchSchema()).rejects.toMatchObject({
      code: ErrorCodes.API_AUTH_FAILED,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stalled.cancel).toHaveBeenCalledTimes(1);
  });
});
