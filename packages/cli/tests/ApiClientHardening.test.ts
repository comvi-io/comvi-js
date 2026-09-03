import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { ErrorCodes } from "../src/utils/errors";
import { thrownBy } from "./helpers";
import type { ProjectInfo } from "../src/types";

const mockProjectInfo: ProjectInfo = {
  id: 123,
  organizationId: 1,
  name: "Test Project",
  description: "A test project",
  sourceLocale: "en",
};

/** Enough for the retry ladder: 500 ms + 1000 ms of backoff between 3 attempts. */
const RETRY_LADDER_MS = 2000;

function okJson(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function status(code: number, statusText: string, headers?: unknown): Response {
  return { ok: false, status: code, statusText, headers } as unknown as Response;
}

/** A fetch that never responds and rejects with AbortError when the timeout fires. */
function abortableFetch() {
  return (_url: unknown, options?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    });
}

const okBulkImport = {
  success: true,
  stats: {
    keysCreated: 0,
    keysUpdated: 0,
    keysDeleted: 0,
    translationsCreated: 0,
    translationsUpdated: 0,
    namespacesCreated: [],
  },
};

describe("ApiClient hardening", () => {
  let apiClient: ApiClient;
  let fetchMock: MockedFunction<typeof fetch>;

  function jsonBodyOfCall(n: number): Record<string, any> {
    const call = fetchMock.mock.calls[n - 1];
    if (!call) {
      throw new Error(`expected at least ${n} fetch calls, got ${fetchMock.mock.calls.length}`);
    }
    return JSON.parse(String((call[1] as RequestInit).body));
  }

  beforeEach(() => {
    vi.useFakeTimers();

    apiClient = new ApiClient({
      apiKey: "test-api-key",
      apiBaseUrl: "https://api.test.com",
      timeout: 5000,
    });

    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("retry backoff policy", () => {
    it("waits out a numeric retry-after header before retrying a 429", async () => {
      fetchMock
        .mockResolvedValueOnce(
          status(429, "Too Many Requests", new Headers({ "retry-after": "2" })),
        )
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const settled = expect(apiClient.validateApiKey()).resolves.toEqual(mockProjectInfo);
      // Keep a handler attached: an early rejection still fails `await settled` below.
      void settled.catch(() => {});

      await vi.advanceTimersByTimeAsync(20);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1979); // 1999 ms since the 429
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); // 2000 ms: the header's 2 seconds are up

      await settled;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("falls back to the default backoff when retry-after is unparseable", async () => {
      fetchMock
        .mockResolvedValueOnce(
          status(429, "Too Many Requests", new Headers({ "retry-after": "abc" })),
        )
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const settled = expect(apiClient.validateApiKey()).resolves.toEqual(mockProjectInfo);
      // Keep a handler attached: an early rejection still fails `await settled` below.
      void settled.catch(() => {});

      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await settled;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("uses the default backoff when a 429 carries no retry-after header", async () => {
      fetchMock
        .mockResolvedValueOnce(status(429, "Too Many Requests", new Headers()))
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const settled = expect(apiClient.validateApiKey()).resolves.toEqual(mockProjectInfo);
      // Keep a handler attached: an early rejection still fails `await settled` below.
      void settled.catch(() => {});

      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await settled;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("ignores a negative retry-after value instead of retrying immediately", async () => {
      fetchMock
        .mockResolvedValueOnce(
          status(429, "Too Many Requests", new Headers({ "retry-after": "-1e3" })),
        )
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const settled = expect(apiClient.validateApiKey()).resolves.toEqual(mockProjectInfo);
      // Keep a handler attached: an early rejection still fails `await settled` below.
      void settled.catch(() => {});

      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await settled;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries immediately for retry-after: 0 regardless of the wall clock", async () => {
      vi.setSystemTime(new Date("1999-06-15T00:00:00Z"));
      fetchMock
        .mockResolvedValueOnce(
          status(429, "Too Many Requests", new Headers({ "retry-after": "0" })),
        )
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const settled = expect(apiClient.validateApiKey()).resolves.toEqual(mockProjectInfo);
      // Keep a handler attached: an early rejection still fails `await settled` below.
      void settled.catch(() => {});

      await vi.advanceTimersByTimeAsync(20);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await settled;
    });

    it("doubles the backoff between consecutive 429 retries", async () => {
      fetchMock
        .mockResolvedValueOnce(status(429, "Too Many Requests"))
        .mockResolvedValueOnce(status(429, "Too Many Requests"))
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const promise = apiClient.validateApiKey();

      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1); // second backoff is 1000 ms, not less

      await expect(promise).resolves.toEqual(mockProjectInfo);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("doubles the backoff between consecutive network-error retries", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const settled = expect(apiClient.validateApiKey()).resolves.toEqual(mockProjectInfo);
      // Keep a handler attached: an early rejection still fails `await settled` below.
      void settled.catch(() => {});

      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);

      await settled;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("leaves no timeout timer running after a request completes", async () => {
      fetchMock.mockResolvedValueOnce(okJson(mockProjectInfo));

      await apiClient.validateApiKey();

      expect(vi.getTimerCount()).toBe(0);
    });

    it("retries a 429 whose response exposes no readable headers", async () => {
      fetchMock
        .mockResolvedValueOnce(status(429, "Too Many Requests", {}))
        .mockResolvedValueOnce(okJson(mockProjectInfo));

      const settled = expect(apiClient.validateApiKey()).resolves.toEqual(mockProjectInfo);
      // Keep a handler attached: an early rejection still fails `await settled` below.
      void settled.catch(() => {});
      await vi.advanceTimersByTimeAsync(500);

      await settled;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("constructor input validation", () => {
    it("rejects a missing API key with a validation error, not a crash", () => {
      const error = thrownBy(
        () =>
          new ApiClient({
            apiKey: undefined as unknown as string,
            apiBaseUrl: "https://api.test.com",
          }),
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(error.message).toBe("API key is required and must be a non-empty string");
    });

    it("rejects a non-string API key with a validation error, not a crash", () => {
      const error = thrownBy(
        () =>
          new ApiClient({
            apiKey: 123 as unknown as string,
            apiBaseUrl: "https://api.test.com",
          }),
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(error.message).toBe("API key is required and must be a non-empty string");
    });

    it("rejects a whitespace-only API key", () => {
      const error = thrownBy(
        () =>
          new ApiClient({
            apiKey: "   ",
            apiBaseUrl: "https://api.test.com",
          }),
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(error.message).toBe("API key is required and must be a non-empty string");
    });

    it("rejects an empty API base URL as missing, not as a malformed URL", () => {
      const error = thrownBy(
        () =>
          new ApiClient({
            apiKey: "test-api-key",
            apiBaseUrl: "",
          }),
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(error.message).toBe("API base URL is required and must be a string");
    });

    it("rejects a non-string API base URL as missing, not as a malformed URL", () => {
      const error = thrownBy(
        () =>
          new ApiClient({
            apiKey: "test-api-key",
            apiBaseUrl: 123 as unknown as string,
          }),
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(error.message).toBe("API base URL is required and must be a string");
    });

    it("rejects a non-numeric timeout", () => {
      const error = thrownBy(
        () =>
          new ApiClient({
            apiKey: "test-api-key",
            apiBaseUrl: "https://api.test.com",
            timeout: "abc" as unknown as number,
          }),
      );

      expect(error.code).toBe(ErrorCodes.INVALID_INPUT);
      expect(error.message).toBe("Timeout must be a positive number");
    });

    it("rejects a zero timeout", () => {
      const error = thrownBy(
        () =>
          new ApiClient({
            apiKey: "test-api-key",
            apiBaseUrl: "https://api.test.com",
            timeout: 0,
          }),
      );

      expect(error.code).toBe(ErrorCodes.INVALID_INPUT);
      expect(error.message).toBe("Timeout must be a positive number");
    });

    it("trims surrounding whitespace off the API key before authenticating", async () => {
      const client = new ApiClient({
        apiKey: "  test-api-key  ",
        apiBaseUrl: "https://api.test.com",
      });
      fetchMock.mockResolvedValueOnce(okJson(mockProjectInfo));

      await client.validateApiKey();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/project",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer test-api-key" }),
        }),
      );
    });
  });

  describe("validateApiKey error contract", () => {
    it("reports a timeout with the API_TIMEOUT code and the configured limit", async () => {
      fetchMock.mockImplementationOnce(abortableFetch());

      const promise = apiClient.validateApiKey();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Request timeout after 5000ms",
        code: ErrorCodes.API_TIMEOUT,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
    });
  });

  describe("fetchTranslations error contract", () => {
    it("reports 401 as an invalid API key", async () => {
      fetchMock.mockResolvedValueOnce(status(401, "Unauthorized"));

      await expect(apiClient.fetchTranslations()).rejects.toMatchObject({
        message: "Invalid API key",
        code: ErrorCodes.API_AUTH_FAILED,
      });
    });

    it("reports other HTTP failures with the status line", async () => {
      fetchMock.mockResolvedValue(status(500, "Internal Server Error"));

      const promise = apiClient.fetchTranslations();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Failed to fetch translations: 500 Internal Server Error",
        code: ErrorCodes.API_FETCH_FAILED,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("reports a timeout with the API_TIMEOUT code and the configured limit", async () => {
      fetchMock.mockImplementationOnce(abortableFetch());

      const promise = apiClient.fetchTranslations();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Request timeout after 5000ms",
        code: ErrorCodes.API_TIMEOUT,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
    });

    it("wraps network errors with a fetch-failed code", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const promise = apiClient.fetchTranslations();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Failed to fetch translations: Network error",
        code: ErrorCodes.API_FETCH_FAILED,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("fetchNamespaces error contract", () => {
    it("reports 401 as an invalid API key", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(status(401, "Unauthorized"));

      await expect(apiClient.fetchNamespaces()).rejects.toMatchObject({
        message: "Invalid API key",
        code: ErrorCodes.API_AUTH_FAILED,
      });
    });

    it("reports other HTTP failures with the status line", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValue(status(500, "Internal Server Error"));

      const promise = apiClient.fetchNamespaces();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Failed to fetch namespaces: 500 Internal Server Error",
        code: ErrorCodes.API_FETCH_FAILED,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("reports a timeout with the API_TIMEOUT code and the configured limit", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockImplementationOnce(abortableFetch());

      const promise = apiClient.fetchNamespaces();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Request timeout after 5000ms",
        code: ErrorCodes.API_TIMEOUT,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
    });

    it("wraps network errors with a fetch-failed code", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockRejectedValue(new Error("Network error"));

      const promise = apiClient.fetchNamespaces();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Failed to fetch namespaces: Network error",
        code: ErrorCodes.API_FETCH_FAILED,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe("pushTranslations error contract", () => {
    it("reports 401 as an invalid API key", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(status(401, "Unauthorized"));

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "override",
        }),
      ).rejects.toMatchObject({
        message: "Invalid API key",
        code: ErrorCodes.API_AUTH_FAILED,
      });
    });

    it("reports 403 as denied project access", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(status(403, "Forbidden"));

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "override",
        }),
      ).rejects.toMatchObject({
        message: "Access denied to this project",
        code: ErrorCodes.API_AUTH_FAILED,
      });
    });

    it("reports a timeout with the API_TIMEOUT code and the configured limit", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockImplementationOnce(abortableFetch());

      const promise = apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Hello" } } },
        forceMode: "override",
      });
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Request timeout after 5000ms",
        code: ErrorCodes.API_TIMEOUT,
      });
      // Keep a handler attached: an early mismatch still fails `await assertion` below.
      void assertion.catch(() => {});
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
    });

    it("wraps a commit network error without retrying the commit", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "override",
        }),
      ).rejects.toMatchObject({
        message: "Failed to push translations: Network error",
        code: ErrorCodes.API_FETCH_FAILED,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2); // a failed commit may already be applied
    });

    it("reports a failed bulk import without an error list as a plain failure", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(okJson({ ...okBulkImport, success: false }));

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "override",
        }),
      ).rejects.toMatchObject({
        message: "Failed to push translations",
        code: ErrorCodes.API_FETCH_FAILED,
      });
    });
  });

  describe("pushTranslations conflict detection", () => {
    it("pushes in abort mode with conflictResolution fail when remote values match", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(
          okJson({ locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } }),
        )
        .mockResolvedValueOnce(okJson(okBulkImport));

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Hello" } } },
        forceMode: "abort",
      });

      expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
      expect(jsonBodyOfCall(3).options.conflictResolution).toBe("fail");
    });

    it("reports no skips in override mode even when the preloaded remote conflicts", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(
          okJson({ ...okBulkImport, stats: { ...okBulkImport.stats, keysCreated: 1 } }),
        );

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Hello" } } },
        forceMode: "override",
        preloadedRemote: {
          locales: ["en"],
          namespaces: ["common"],
          translations: { en: { common: { greeting: "Remote" } } },
        },
      });

      expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
      expect(fetchMock).toHaveBeenCalledTimes(2); // the preloaded remote spares a second fetch
    });

    it("sees no conflict when the remote lacks the locale entirely", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(
          okJson({ locales: ["de"], namespaces: { common: { de: { greeting: "Hallo" } } } }),
        )
        .mockResolvedValueOnce(okJson(okBulkImport));

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "abort",
        }),
      ).resolves.toEqual({ created: 0, updated: 0, skipped: 0 });
    });

    it("sees no conflict when the remote lacks the namespace", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(
          okJson({ locales: ["en"], namespaces: { other: { en: { label: "x" } } } }),
        )
        .mockResolvedValueOnce(okJson(okBulkImport));

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "abort",
        }),
      ).resolves.toEqual({ created: 0, updated: 0, skipped: 0 });
    });

    it("sees no conflict when the remote lacks the key", async () => {
      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(
          okJson({ locales: ["en"], namespaces: { common: { en: { farewell: "Bye" } } } }),
        )
        .mockResolvedValueOnce(okJson(okBulkImport));

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "abort",
        }),
      ).resolves.toEqual({ created: 0, updated: 0, skipped: 0 });
    });
  });

  describe("project info caching", () => {
    it("revalidates the API key after a failed project lookup", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("boom"))
        .mockRejectedValueOnce(new Error("boom"))
        .mockRejectedValueOnce(new Error("boom"));

      const first = apiClient.fetchSchema();
      const failure = expect(first).rejects.toMatchObject({
        code: ErrorCodes.API_FETCH_FAILED,
      });
      void failure.catch(() => {});
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);
      await failure;

      fetchMock
        .mockResolvedValueOnce(okJson(mockProjectInfo))
        .mockResolvedValueOnce(okJson({ keys: {} }));

      await expect(apiClient.fetchSchema()).resolves.toEqual({ keys: {} });
    });
  });
});
