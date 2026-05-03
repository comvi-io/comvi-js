import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import {
  DemoModeError,
  deleteTranslation,
  getAllTranslationKeys,
  getTranslation,
  saveTranslation,
} from "../src/services/translationService";

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

describe("translationService", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetApiConfig();
  });

  it("should parse combined ICU data when API declares isPlural=true", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        id: 1,
        key: "inbox.messages",
        namespaceId: 10,
        isPlural: true,
        namespace: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        translations: {
          en: {
            id: 11,
            value:
              "{formality, select, formal {{count, plural, one {You have # message} other {You have # messages}}} informal {{count, plural, one {You've got # message} other {You've got # messages}}}}",
            status: "not_reviewed",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            createdBy: 1,
            reviewedBy: 1,
          },
        },
      }),
    );

    const result = await getTranslation("inbox.messages", "default");

    expect(result).not.toBeNull();
    expect(result?.isPlural).toBe(true);
    expect(result?.pluralVariable).toBe("count");
    expect(result?.selectConfigs?.en?.enabled).toBe(true);
    expect(result?.selectConfigs?.en?.variable).toBe("formality");
    expect(result?.selectConfigs?.en?.options).toEqual(["formal", "informal"]);
    expect(result?.translations.en?.["formal:one"]).toBe("You have # message");
    expect(result?.translations.en?.["informal:other"]).toBe("You've got # messages");
  });

  it("should preserve combined ICU structure after save round-trip", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        id: 1,
        key: "checkout.items",
        namespaceId: 10,
        isPlural: true,
        namespace: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        translations: {
          en: {
            id: 11,
            value:
              "{formality, select, formal {{count, plural, one {You have # item} other {You have # items}}} informal {{count, plural, one {You've got # item} other {You've got # items}}}}",
            status: "not_reviewed",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            createdBy: 1,
            reviewedBy: 1,
          },
        },
      }),
    );

    const result = await saveTranslation(
      "checkout.items",
      "default",
      {
        en: {
          "formal:one": "You have # item",
          "formal:other": "You have # items",
          "informal:one": "You've got # item",
          "informal:other": "You've got # items",
        },
      },
      true,
      "count",
      {
        en: {
          enabled: true,
          variable: "formality",
          options: ["formal", "informal"],
        },
      },
    );

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall?.[0]).toBe("https://api.example.com/v1/keys");
    const requestInit = fetchCall?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.translations.en.value).toContain("{formality, select,");
    expect(payload.translations.en.value).toContain("{count, plural,");

    expect(result.isPlural).toBe(true);
    expect(result.pluralVariable).toBe("count");
    expect(result.selectConfigs?.en?.enabled).toBe(true);
    expect(result.selectConfigs?.en?.options).toEqual(["formal", "informal"]);
    expect(result.translations.en?.["formal:one"]).toBe("You have # item");
    expect(result.translations.en?.["informal:other"]).toBe("You've got # items");
  });

  it("should return empty translation structure when key is missing (404)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockErrorResponse(404, "Not Found"));

    const result = await getTranslation("missing.key", "default");

    expect(result).toEqual({
      key: "missing.key",
      isPlural: false,
      translations: {},
      metadata: {
        createdAt: expect.any(String),
      },
    });
  });

  it("should throw normalized error when getTranslation receives non-ok response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    await expect(getTranslation("home.title", "default")).rejects.toThrow(
      "Failed to fetch translation",
    );
  });

  it("should keep scoped API configs isolated across editor runtimes", async () => {
    initApiConfig("runtime-a-key", "runtime-a");
    initApiConfig("runtime-b-key", "runtime-b");

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        id: 1,
        key: "home.title",
        namespaceId: 10,
        isPlural: false,
        namespace: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        translations: {},
      }),
    );

    await getTranslation("home.title", "default", "runtime-a");

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/keys/default/home.title", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-a-key",
      },
    });
  });

  it("should send singular values as plain text", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        id: 1,
        key: "home.title",
        namespaceId: 10,
        isPlural: false,
        namespace: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        translations: {
          en: {
            id: 11,
            value: "Updated title",
            status: "not_reviewed",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            createdBy: 1,
            reviewedBy: 1,
          },
        },
      }),
    );

    await saveTranslation(
      "home.title",
      "default",
      {
        en: { other: "Updated title" },
      },
      false,
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.translations.en.value).toBe("Updated title");
  });

  it("should send select-only translations as ICU select", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        id: 1,
        key: "welcome.message",
        namespaceId: 10,
        isPlural: false,
        namespace: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        translations: {
          en: {
            id: 11,
            value: "{formality, select, formal {Welcome} informal {Hi}}",
            status: "not_reviewed",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            createdBy: 1,
            reviewedBy: 1,
          },
        },
      }),
    );

    await saveTranslation(
      "welcome.message",
      "default",
      {
        en: { formal: "Welcome", informal: "Hi" },
      },
      false,
      undefined,
      {
        en: {
          enabled: true,
          variable: "formality",
          options: ["formal", "informal"],
        },
      },
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.translations.en.value).toContain("{formality, select,");
    expect(payload.translations.en.value).toContain("formal {Welcome}");
    expect(payload.translations.en.value).toContain("informal {Hi}");
  });

  it("should throw demo mode error when trying to save or delete in demo mode", async () => {
    initApiConfig(undefined);

    await expect(
      saveTranslation(
        "home.title",
        "default",
        {
          en: { other: "Hello" },
        },
        false,
      ),
    ).rejects.toBeInstanceOf(DemoModeError);

    await expect(deleteTranslation("home.title", "default")).rejects.toBeInstanceOf(DemoModeError);
  });

  it("should delete translation with encoded namespace/key", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockOkResponse({}));

    await deleteTranslation("title/with/slash", "space ns");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/keys/space%20ns/title%2Fwith%2Fslash",
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
      },
    );
  });

  it("should throw normalized error when delete request fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    await expect(deleteTranslation("home.title", "default")).rejects.toThrow(
      "Failed to delete translation",
    );
  });

  it("should fetch all translation keys", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        locales: ["en", "fr"],
        namespaces: {
          default: {
            en: { "home.title": "Home", "cart.total": "Total" },
            fr: { "home.title": "Accueil" },
          },
        },
      }),
    );

    const result = await getAllTranslationKeys();

    expect(result).toEqual(["cart.total", "home.title"]);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/translations", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
    });
  });

  it("should return empty array when getAllTranslationKeys fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    const result = await getAllTranslationKeys();

    expect(result).toEqual([]);
  });

  it("should return empty array for getAllTranslationKeys in demo mode", async () => {
    initApiConfig(undefined);

    const result = await getAllTranslationKeys();

    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should pass description field from API response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        id: 1,
        key: "home.title",
        description: "Main heading on the homepage",
        namespaceId: 10,
        isPlural: false,
        namespace: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        translations: {
          en: {
            id: 11,
            value: "Welcome",
            status: "not_reviewed",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            createdBy: 1,
            reviewedBy: 1,
          },
        },
      }),
    );

    const result = await getTranslation("home.title", "default");

    expect(result).not.toBeNull();
    expect(result?.description).toBe("Main heading on the homepage");
  });

  it("should handle missing description field gracefully", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse({
        id: 1,
        key: "home.title",
        namespaceId: 10,
        isPlural: false,
        namespace: "default",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        translations: {},
      }),
    );

    const result = await getTranslation("home.title", "default");

    expect(result).not.toBeNull();
    expect(result?.description).toBeUndefined();
  });
});
