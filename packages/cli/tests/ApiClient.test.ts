import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { ErrorCodes } from "../src/utils/errors";
import type { ProjectSchema, ProjectInfo } from "../src/types";

const mockProjectInfo: ProjectInfo = {
  id: 123,
  organizationId: 1,
  name: "Test Project",
  description: "A test project",
  sourceLocale: "en",
};

/** Enough for the retry ladder: 500 ms + 1000 ms of backoff between 3 attempts. */
const RETRY_LADDER_MS = 2000;

describe("ApiClient", () => {
  let apiClient: ApiClient;
  let fetchMock: MockedFunction<typeof fetch>;

  function requestBodyOfCall(n: number): Record<string, any> {
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

  describe("fetchSchema", () => {
    it("should fetch schema successfully", async () => {
      const mockSchema: ProjectSchema = {
        keys: {
          "common:welcome": { params: [] },
          "common:greeting": {
            params: [{ name: "name", type: "string" }],
          },
          "common:items": {
            params: [{ name: "count", type: "number" }],
          },
        },
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSchema,
        } as Response);

      const result = await apiClient.fetchSchema();

      expect(result).toEqual(mockSchema);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/projects/123/schema",
        expect.objectContaining({
          method: "GET",
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("should throw error on 401 unauthorized", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response);

      await expect(apiClient.fetchSchema()).rejects.toThrow("Invalid API key");
    });

    it("should throw error on 403 forbidden", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: "Forbidden",
        } as Response);

      await expect(apiClient.fetchSchema()).rejects.toThrow("Access denied to this project");
    });

    it("should throw error on other failed requests", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response);

      const promise = apiClient.fetchSchema();
      // the rejection handler must be attached before the backoff timers run
      const assertion = expect(promise).rejects.toThrow(
        "Failed to fetch schema: 500 Internal Server Error",
      );
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4); // project lookup + 3 schema attempts
    });

    it("should handle timeout", async () => {
      const slowClient = new ApiClient({
        apiKey: "test-api-key",
        apiBaseUrl: "https://api.test.com",
        timeout: 100,
      });

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockImplementationOnce(
          (_url, options) =>
            new Promise<Response>((_resolve, reject) => {
              options!.signal!.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted", "AbortError"));
              });
            }),
        );

      const promise = slowClient.fetchSchema();
      const assertion = expect(promise).rejects.toThrow("Request timeout after 100ms");
      await vi.advanceTimersByTimeAsync(100);

      await assertion;
    });

    it("should surface project lookup network errors before fetching schema", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const promise = apiClient.fetchSchema();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Failed to validate API key: Network error",
        code: ErrorCodes.API_FETCH_FAILED,
      });
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("should handle schema fetch network errors", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockRejectedValue(new Error("Network error"));

      const promise = apiClient.fetchSchema();
      const assertion = expect(promise).rejects.toMatchObject({
        message: "Failed to fetch schema: Network error",
        code: ErrorCodes.API_FETCH_FAILED,
      });
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("should remove trailing slash from base URL", async () => {
      const client = new ApiClient({
        apiKey: "test-api-key",
        apiBaseUrl: "https://api.test.com/",
      });

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ keys: {} }),
        } as Response);

      await client.fetchSchema();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/projects/123/schema",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  describe("validateApiKey", () => {
    it("should return project info for valid API key", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjectInfo,
      } as Response);

      const result = await apiClient.validateApiKey();

      expect(result).toEqual(mockProjectInfo);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/project",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        }),
      );
    });

    it("should throw error for invalid API key", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response);

      await expect(apiClient.validateApiKey()).rejects.toThrow("Invalid API key");
    });
  });

  describe("validateConnection", () => {
    it("should return true for valid connection", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjectInfo,
      } as Response);

      const result = await apiClient.validateConnection();

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/project",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        }),
      );
    });

    it("should return false for invalid connection", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await apiClient.validateConnection();

      expect(result).toBe(false);
    });

    it("should return false on network error", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const promise = apiClient.validateConnection();
      await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);

      await expect(promise).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("fetchTranslations", () => {
    it("should fetch translations successfully", async () => {
      const mockResponse = {
        locales: ["en", "uk"],
        namespaces: {
          common: {
            en: { greeting: "Hello" },
            uk: { greeting: "Привіт" },
          },
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await apiClient.fetchTranslations();

      expect(result).toEqual({
        locales: ["en", "uk"],
        namespaces: ["common"],
        translations: {
          en: { common: { greeting: "Hello" } },
          uk: { common: { greeting: "Привіт" } },
        },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/translations",
        expect.objectContaining({
          method: "GET",
        }),
      );
    });

    it("should apply locale and namespace filters", async () => {
      const mockResponse = {
        locales: ["en"],
        namespaces: { common: { en: { greeting: "Hello" } } },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await apiClient.fetchTranslations({
        locales: ["en", "uk"],
        namespaces: ["common", "admin"],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/translations?locales=en%2Cuk&namespaces=common%2Cadmin",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should throw error on 403 forbidden", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as Response);

      await expect(apiClient.fetchTranslations()).rejects.toMatchObject({
        message: "Access denied to this project",
        code: ErrorCodes.API_AUTH_FAILED,
      });
    });
  });

  describe("fetchNamespaces", () => {
    it("should reject a response body that is not an array", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ namespaces: [] }),
        } as Response);

      await expect(apiClient.fetchNamespaces()).rejects.toMatchObject({
        message: "Invalid namespaces response: expected an array",
        code: ErrorCodes.API_INVALID_RESPONSE,
      });
    });

    it("should throw error on 403 forbidden", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: "Forbidden",
        } as Response);

      await expect(apiClient.fetchNamespaces()).rejects.toMatchObject({
        message: "Access denied to project namespaces",
        code: ErrorCodes.API_AUTH_FAILED,
      });
    });
  });

  describe("fetchDefaultNamespace", () => {
    it("should fetch the backend default namespace", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 1,
              projectId: 123,
              namespace: "common",
              description: null,
              isDefault: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: 2,
              projectId: 123,
              namespace: "admin",
              description: null,
              isDefault: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        } as Response);

      await expect(apiClient.fetchDefaultNamespace()).resolves.toBe("common");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/projects/123/namespaces",
        expect.objectContaining({
          method: "GET",
        }),
      );
    });

    it("should reject when the backend does not return exactly one default namespace", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 1,
              projectId: 123,
              namespace: "common",
              description: null,
              isDefault: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        } as Response);

      await expect(apiClient.fetchDefaultNamespace()).rejects.toThrow(
        "Project has no default namespace",
      );
    });

    it("should reject when the backend returns multiple default namespaces", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 1,
              projectId: 123,
              namespace: "common",
              description: null,
              isDefault: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: 2,
              projectId: 123,
              namespace: "default",
              description: null,
              isDefault: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        } as Response);

      await expect(apiClient.fetchDefaultNamespace()).rejects.toThrow(
        "Project has multiple default namespaces",
      );
    });
  });

  describe("pushTranslations", () => {
    it("should push translations through the bulk import endpoint", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            stats: {
              keysCreated: 1,
              keysUpdated: 0,
              keysDeleted: 0,
              translationsCreated: 1,
              translationsUpdated: 0,
              namespacesCreated: [],
            },
          }),
        } as Response);

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Hello" } } },
        forceMode: "override",
      });

      expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/v1/projects/123/import/commit",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(requestBodyOfCall(2)).toEqual({
        namespaces: {
          common: {
            en: { greeting: "Hello" },
          },
        },
        options: {
          conflictResolution: "keep_local",
          createNamespaces: true,
          deleteOrphans: false,
        },
      });
    });

    it("should send keep_server conflict resolution for keep mode", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            locales: ["en"],
            namespaces: { common: { en: { greeting: "Remote" } } },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            stats: {
              keysCreated: 0,
              keysUpdated: 0,
              keysDeleted: 0,
              translationsCreated: 0,
              translationsUpdated: 0,
              namespacesCreated: [],
            },
          }),
        } as Response);

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Local" } } },
        forceMode: "keep",
      });

      expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
      expect(requestBodyOfCall(3).options.conflictResolution).toBe("keep_server");
    });

    it("should use the bulk response translationsUpdated count", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            stats: {
              keysCreated: 0,
              keysUpdated: 1,
              keysDeleted: 0,
              translationsCreated: 0,
              translationsUpdated: 1,
              namespacesCreated: [],
            },
          }),
        } as Response);

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Hello" } } },
        forceMode: "override",
      });

      expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
    });

    it("should reject failed bulk import responses", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: false,
            stats: {
              keysCreated: 0,
              keysUpdated: 0,
              keysDeleted: 0,
              translationsCreated: 0,
              translationsUpdated: 0,
              namespacesCreated: [],
            },
            errors: [{ namespace: "common", key: "greeting", message: "Invalid value" }],
          }),
        } as Response);

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "override",
        }),
      ).rejects.toThrow("Failed to push translations: common:greeting Invalid value");
    });

    it("should abort before writing when forceMode is abort and conflicts exist", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            locales: ["en"],
            namespaces: { common: { en: { greeting: "Remote" } } },
          }),
        } as Response);

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Local" } } },
          forceMode: "abort",
        }),
      ).rejects.toThrow("Conflict detected for 1 translations");

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("should report push progress once after the bulk request completes", async () => {
      const onProgress = vi.fn();
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            stats: {
              keysCreated: 1,
              keysUpdated: 1,
              keysDeleted: 0,
              translationsCreated: 1,
              translationsUpdated: 1,
              namespacesCreated: [],
            },
          }),
        } as Response);

      await apiClient.pushTranslations({
        translations: {
          en: {
            common: {
              greeting: "Hello",
              farewell: "Bye",
            },
          },
        },
        forceMode: "override",
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledOnce();
      expect(onProgress).toHaveBeenLastCalledWith({
        total: 2,
        completed: 2,
        created: 1,
        updated: 1,
        skipped: 0,
      });
    });
  });

  describe("constructor validation", () => {
    it("should throw error for missing API key", () => {
      expect(
        () =>
          new ApiClient({
            apiKey: "",
            apiBaseUrl: "https://api.test.com",
          }),
      ).toThrow("API key is required");
    });

    it("should throw error for invalid URL", () => {
      expect(
        () =>
          new ApiClient({
            apiKey: "test-key",
            apiBaseUrl: "not-a-url",
          }),
      ).toThrow("Invalid API base URL");
    });

    it("should throw error for invalid timeout", () => {
      expect(
        () =>
          new ApiClient({
            apiKey: "test-key",
            apiBaseUrl: "https://api.test.com",
            timeout: -1,
          }),
      ).toThrow("Timeout must be a positive number");
    });
  });
});
