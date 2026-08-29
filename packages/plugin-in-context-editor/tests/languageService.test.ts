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
    resetApiConfig();
  });

  it("returns empty list in demo mode", async () => {
    initApiConfig(undefined);

    const result = await getLanguages();

    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests the project locales with the configured bearer key", async () => {
    initApiConfig("test-api-key");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        sourceLocale: "en",
        locales: [{ id: 1, code: "en", name: "English", nativeName: "English" }],
      }),
    );

    await getLanguages();

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/project/locales", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
    });
  });

  it("enriches each locale with its CLDR plural forms and the source marker", async () => {
    initApiConfig("test-api-key");
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse({
        sourceLocale: "en",
        locales: [
          { id: 1, code: "en", name: "English", nativeName: "English" },
          { id: 2, code: "uk", name: "Ukrainian", nativeName: "Українська" },
        ],
      }),
    );

    const result = await getLanguages();

    expect(result).toEqual([
      {
        id: 1,
        code: "en",
        name: "English",
        nativeName: "English",
        pluralForms: ["one", "other"],
        isSource: true,
      },
      {
        id: 2,
        code: "uk",
        name: "Ukrainian",
        nativeName: "Українська",
        pluralForms: ["one", "few", "many", "other"],
        isSource: false,
      },
    ]);
  });

  it("returns an empty list when the project has no locales", async () => {
    initApiConfig("test-api-key");
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ sourceLocale: "en", locales: [] }));

    await expect(getLanguages()).resolves.toEqual([]);
  });

  it("throws normalized error when API responds with non-ok status", async () => {
    initApiConfig("test-api-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    await expect(getLanguages()).rejects.toThrow("Failed to fetch languages");
  });

  it("throws normalized error when fetch fails", async () => {
    initApiConfig("test-api-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network down"));

    await expect(getLanguages()).rejects.toThrow("Failed to fetch languages");
  });

  it("throws normalized error when the response body is not JSON", async () => {
    initApiConfig("test-api-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/project/locales", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-a-key",
      },
    });
  });
});
