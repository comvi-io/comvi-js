import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import type { ProjectSchema, ProjectInfo } from "../src/types";

// Polyfill DOMException for Node.js environment
if (typeof DOMException === "undefined") {
  (global as any).DOMException = class DOMException extends Error {
    constructor(
      message: string,
      public name: string,
    ) {
      super(message);
    }
  };
}

const mockProjectInfo: ProjectInfo = {
  id: 123,
  organizationId: 1,
  name: "Test Project",
  description: "A test project",
  sourceLocale: "en",
};

describe("ApiClient", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    apiClient = new ApiClient({
      apiKey: "test-api-key",
      apiBaseUrl: "https://api.test.com",
      timeout: 5000,
    });

    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSchema,
        });

      const result = await apiClient.fetchSchema();

      expect(result).toEqual(mockSchema);
      expect(global.fetch).toHaveBeenCalledWith(
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
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(apiClient.fetchSchema()).rejects.toThrow("Invalid API key");
    });

    it("should throw error on 403 forbidden", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: "Forbidden",
        });

      await expect(apiClient.fetchSchema()).rejects.toThrow("Access denied to this project");
    });

    it("should throw error on other failed requests", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });

      await expect(apiClient.fetchSchema()).rejects.toThrow(
        "Failed to fetch schema: 500 Internal Server Error",
      );
    });

    it("should handle timeout", async () => {
      const slowClient = new ApiClient({
        apiKey: "test-api-key",
        apiBaseUrl: "https://api.test.com",
        timeout: 100,
      });

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockImplementationOnce(
          (_url: string, options: any) =>
            new Promise((resolve, reject) => {
              // Simulate abort signal
              if (options?.signal) {
                options.signal.addEventListener("abort", () => {
                  reject(new DOMException("The operation was aborted", "AbortError"));
                });
              }

              setTimeout(() => {
                resolve({
                  ok: true,
                  json: async () => ({ keys: {} }),
                });
              }, 200);
            }),
        );

      await expect(slowClient.fetchSchema()).rejects.toThrow("Request timeout after 100ms");
    });

    it("should surface project lookup network errors before fetching schema", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      await expect(apiClient.fetchSchema()).rejects.toThrow("Failed to validate API key");
    });

    it("should handle schema fetch network errors", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(apiClient.fetchSchema()).rejects.toThrow("Failed to fetch schema");
    });

    it("should remove trailing slash from base URL", async () => {
      const client = new ApiClient({
        apiKey: "test-api-key",
        apiBaseUrl: "https://api.test.com/",
      });

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ keys: {} }),
        });

      await client.fetchSchema();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/v1/projects/123/schema",
        expect.any(Object),
      );
    });
  });

  describe("validateApiKey", () => {
    it("should return project info for valid API key", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjectInfo,
      });

      const result = await apiClient.validateApiKey();

      expect(result).toEqual(mockProjectInfo);
      expect(global.fetch).toHaveBeenCalledWith(
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
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(apiClient.validateApiKey()).rejects.toThrow("Invalid API key");
    });
  });

  describe("validateConnection", () => {
    it("should return true for valid connection", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjectInfo,
      });

      const result = await apiClient.validateConnection();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
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
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await apiClient.validateConnection();

      expect(result).toBe(false);
    });

    it("should return false on network error", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await apiClient.validateConnection();

      expect(result).toBe(false);
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

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.fetchTranslations();

      expect(result).toEqual({
        languages: ["en", "uk"],
        namespaces: ["common"],
        translations: {
          en: { common: { greeting: "Hello" } },
          uk: { common: { greeting: "Привіт" } },
        },
      });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/v1/translations",
        expect.objectContaining({
          method: "GET",
        }),
      );
    });

    it("should apply language and namespace filters", async () => {
      const mockResponse = {
        locales: ["en"],
        namespaces: { common: { en: { greeting: "Hello" } } },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await apiClient.fetchTranslations({
        languages: ["en", "uk"],
        namespaces: ["common", "admin"],
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/v1/translations?locales=en%2Cuk&namespaces=common%2Cadmin",
        expect.any(Object),
      );
    });
  });

  describe("pushTranslations", () => {
    it("should push translations through the bulk import endpoint", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
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
        });

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Hello" } } },
        forceMode: "override",
      });

      expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/v1/projects/123/import/commit",
        expect.objectContaining({
          method: "POST",
        }),
      );

      const callArgs = (global.fetch as any).mock.calls[1];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody).toEqual({
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
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            locales: ["en"],
            namespaces: { common: { en: { greeting: "Remote" } } },
          }),
        })
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
        });

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Local" } } },
        forceMode: "keep",
      });

      expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
      const requestBody = JSON.parse((global.fetch as any).mock.calls[2][1].body);
      expect(requestBody.options.conflictResolution).toBe("keep_server");
    });

    it("should use the bulk response translationsUpdated count", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
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
        });

      const result = await apiClient.pushTranslations({
        translations: { en: { common: { greeting: "Hello" } } },
        forceMode: "override",
      });

      expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
    });

    it("should reject failed bulk import responses", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
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
        });

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Hello" } } },
          forceMode: "override",
        }),
      ).rejects.toThrow("Failed to push translations: common:greeting Invalid value");
    });

    it("should abort before writing when forceMode is abort and conflicts exist", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            locales: ["en"],
            namespaces: { common: { en: { greeting: "Remote" } } },
          }),
        });

      await expect(
        apiClient.pushTranslations({
          translations: { en: { common: { greeting: "Local" } } },
          forceMode: "abort",
        }),
      ).rejects.toThrow("Conflict detected for 1 translations");

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should report push progress once after the bulk request completes", async () => {
      const onProgress = vi.fn();
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProjectInfo,
        })
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
        });

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
