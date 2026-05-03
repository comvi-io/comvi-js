import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { getLanguages } from "../src/services/languageService";

function mockOkResponse<T>(payload: T): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}

function mockErrorResponse(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  } as Response;
}

describe("languageService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetApiConfig();
  });

  it("returns empty list in demo mode", async () => {
    initApiConfig(undefined);

    const result = await getLanguages();

    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches locales and enriches them with plural forms and source marker", async () => {
    initApiConfig("test-api-key");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        sourceLocale: "en",
        locales: [
          { id: 1, code: "en", name: "English", nativeName: "English" },
          { id: 2, code: "uk", name: "Ukrainian", nativeName: "Українська" },
        ],
      }),
    );

    const result = await getLanguages();

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/project/locales", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.isSource).toBe(true);
    expect(result[1]?.isSource).toBe(false);
    expect(result[0]?.pluralForms.length).toBeGreaterThan(0);
    expect(result[1]?.pluralForms.length).toBeGreaterThan(0);
  });

  it("throws normalized error when API responds with non-ok status", async () => {
    initApiConfig("test-api-key");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    await expect(getLanguages()).rejects.toThrow("Failed to fetch languages");
  });

  it("uses the requested runtime scope instead of the most recently initialized config", async () => {
    initApiConfig("runtime-a-key", "runtime-a");
    initApiConfig("runtime-b-key", "runtime-b");

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        sourceLocale: "en",
        locales: [{ id: 1, code: "en", name: "English", nativeName: "English" }],
      }),
    );

    await getLanguages("runtime-a");

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/project/locales", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-a-key",
      },
    });
  });

  it("throws normalized error when fetch fails", async () => {
    initApiConfig("test-api-key");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(getLanguages()).rejects.toThrow("Failed to fetch languages");
  });
});
