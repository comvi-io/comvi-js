import { afterEach, beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { timeoutsFromEnv } from "../src/core/timeouts";
import { ErrorCodes } from "../src/utils/errors";
import type { ProjectInfo } from "../src/types";

const projectInfo = { id: 123, name: "Test Project" } as ProjectInfo;

/** Headers at once; the body takes `bodyMs`, and rejects as fetch does on abort. */
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
    return Promise.resolve({ ok: true, status: 200, json: read } as unknown as Response);
  };
}

const commitBody = {
  success: true,
  stats: {
    keysCreated: 1,
    keysUpdated: 0,
    keysDeleted: 0,
    translationsCreated: 1,
    translationsUpdated: 0,
    namespacesCreated: [],
  },
};

describe("the commit has its own, longer timeout", () => {
  let fetchMock: MockedFunction<typeof fetch>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const push = (client: ApiClient) =>
    client.pushTranslations({
      translations: { en: { default: { a: "A" } } },
      forceMode: "override",
    });

  it("lets a commit run past the read timeout", async () => {
    const client = new ApiClient({
      apiKey: "k",
      apiBaseUrl: "https://api.test.com",
      timeout: 20,
      commitTimeout: 1000,
    });
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response)
      .mockImplementationOnce(slowBody(commitBody, 200));

    const settled = expect(push(client)).resolves.toMatchObject({ created: 1 });
    void settled.catch(() => {});
    await vi.advanceTimersByTimeAsync(250);
    await settled;
  });

  it("defaults the commit timeout to five minutes", async () => {
    const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com" });
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response)
      .mockImplementationOnce(slowBody(commitBody, 4 * 60_000));

    const settled = expect(push(client)).resolves.toMatchObject({ created: 1 });
    void settled.catch(() => {});
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 100);
    await settled;
  });

  // `timeout` used to cover the commit too; a library caller that set only it
  // keeps that budget.
  it("uses an explicit `timeout` for the commit when no `commitTimeout` is given", async () => {
    const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com", timeout: 20 });
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response)
      .mockImplementationOnce(slowBody(commitBody, 200));

    const assertion = expect(push(client)).rejects.toMatchObject({
      code: ErrorCodes.API_TIMEOUT,
      message: expect.stringContaining("Push timed out after 20ms"),
    });
    void assertion.catch(() => {});
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it("says a timed-out commit may still have been applied and is safe to re-run", async () => {
    const client = new ApiClient({
      apiKey: "k",
      apiBaseUrl: "https://api.test.com",
      commitTimeout: 50,
    });
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => projectInfo } as Response)
      .mockImplementationOnce(slowBody(commitBody, 500));

    const assertion = expect(push(client)).rejects.toMatchObject({
      code: ErrorCodes.API_TIMEOUT,
      message: expect.stringMatching(
        /timed out after 50ms.*may still have applied it.*safe to re-run/s,
      ),
    });
    void assertion.catch(() => {});
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("COMVI_TIMEOUT_MS", () => {
  it("is not set: nothing is overridden", () => {
    expect(timeoutsFromEnv({})).toEqual({});
  });

  it("sets the read timeout and never shortens the commit below five minutes", () => {
    expect(timeoutsFromEnv({ COMVI_TIMEOUT_MS: "120000" })).toEqual({
      timeout: 120_000,
      commitTimeout: 300_000,
    });
  });

  it("lengthens the commit when it is above five minutes", () => {
    expect(timeoutsFromEnv({ COMVI_TIMEOUT_MS: "600000" })).toEqual({
      timeout: 600_000,
      commitTimeout: 600_000,
    });
  });

  it("accepts the largest delay a timer honours", () => {
    expect(timeoutsFromEnv({ COMVI_TIMEOUT_MS: "2147483647" }).timeout).toBe(2_147_483_647);
  });

  // Above 2^31-1 ms Node fires the timer after 1 ms: every request would abort at once.
  it.each(["0", "-5", "abc", "1.5", "10s", "", "2147483648", "3000000000"])(
    "refuses %j as invalid configuration",
    (value) => {
      expect(() => timeoutsFromEnv({ COMVI_TIMEOUT_MS: value })).toThrow(
        expect.objectContaining({
          code: ErrorCodes.CONFIG_INVALID,
          message: expect.stringContaining("COMVI_TIMEOUT_MS"),
        }),
      );
    },
  );
});
