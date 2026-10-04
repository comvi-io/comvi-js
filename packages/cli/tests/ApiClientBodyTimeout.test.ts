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
    client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com", timeout: 20 });
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
      message: "Request timeout after 20ms",
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
