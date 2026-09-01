import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import {
  DemoModeError,
  deleteTranslation,
  getAllTranslationKeys,
  getTranslation,
  saveTranslation,
} from "../src/services/translationService";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

/**
 * The API's key payload. `id`/`namespaceId`/`status`/`createdBy`/`reviewedBy`
 * are required by the response shape but never read by these assertions, so
 * they are fixed here and only the fields under test are passed in.
 */
function makeKeyResponse({
  key,
  isPlural = false,
  description,
  values = {},
}: {
  key: string;
  isPlural?: boolean;
  description?: string;
  values?: Record<string, string>;
}) {
  return {
    id: 1,
    key,
    ...(description === undefined ? {} : { description }),
    namespaceId: 10,
    isPlural,
    namespace: "default",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    translations: Object.fromEntries(
      Object.entries(values).map(([languageCode, value]) => [
        languageCode,
        {
          id: 11,
          value,
          status: "not_reviewed",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
          createdBy: 1,
          reviewedBy: 1,
        },
      ]),
    ),
  };
}

function mockOkResponse<T>(payload: T): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}

/**
 * The body is a *valid* payload on purpose: a service that stopped checking
 * `response.ok` would then succeed on it instead of failing on a malformed
 * body, so these tests pin the status check itself.
 */
function mockErrorResponse(
  status: number,
  statusText: string,
  payload: unknown = makeKeyResponse({ key: "home.title", values: { en: "Hello" } }),
): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => payload,
  } as Response;
}

function sentBody(fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>) {
  const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(requestInit.body));
}

describe("translationService", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    resetApiConfig();
  });

  it("should parse combined ICU data when API declares isPlural=true", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(
        makeKeyResponse({
          key: "inbox.messages",
          isPlural: true,
          values: {
            en: "{formality, select, formal {{count, plural, one {You have # message} other {You have # messages}}} informal {{count, plural, one {You've got # message} other {You've got # messages}}}}",
          },
        }),
      ),
    );

    const result = await getTranslation("inbox.messages", "default");

    expect(result).toEqual({
      key: "inbox.messages",
      description: undefined,
      isPlural: true,
      pluralVariable: "count",
      translations: {
        en: {
          "formal:one": "You have # message",
          "formal:other": "You have # messages",
          "informal:one": "You've got # message",
          "informal:other": "You've got # messages",
        },
      },
      selectConfigs: {
        en: { enabled: true, variable: "formality", options: ["formal", "informal"] },
      },
      metadata: { createdAt: TIMESTAMP, lastModified: TIMESTAMP },
    });
  });

  it("should send composite plural and select forms as combined ICU", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse(makeKeyResponse({ key: "checkout.items", isPlural: true })),
    );

    await saveTranslation(
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
      { en: { enabled: true, variable: "formality", options: ["formal", "informal"] } },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/keys");
    expect(sentBody(fetchMock)).toEqual({
      key: "checkout.items",
      namespace: "default",
      isPlural: true,
      translations: {
        en: {
          value:
            "{formality, select, formal {{count, plural, one {You have # item} other {You have # items}}} informal {{count, plural, one {You've got # item} other {You've got # items}}}}",
          status: "not_reviewed",
        },
      },
    });
  });

  it("should parse the saved combined ICU back into composite forms", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(
        makeKeyResponse({
          key: "checkout.items",
          isPlural: true,
          values: {
            en: "{formality, select, formal {{count, plural, one {You have # item} other {You have # items}}} informal {{count, plural, one {You've got # item} other {You've got # items}}}}",
          },
        }),
      ),
    );

    const result = await saveTranslation(
      "checkout.items",
      "default",
      { en: { "formal:one": "You have # item" } },
      true,
      "count",
      { en: { enabled: true, variable: "formality", options: ["formal", "informal"] } },
    );

    expect(result.isPlural).toBe(true);
    expect(result.pluralVariable).toBe("count");
    expect(result.selectConfigs).toEqual({
      en: { enabled: true, variable: "formality", options: ["formal", "informal"] },
    });
    expect(result.translations.en).toEqual({
      "formal:one": "You have # item",
      "formal:other": "You have # items",
      "informal:one": "You've got # item",
      "informal:other": "You've got # items",
    });
  });

  it("should return empty translation structure when key is missing (404)", async () => {
    vi.useFakeTimers({ now: new Date("2026-03-04T05:06:07.008Z") });
    vi.mocked(fetch).mockResolvedValueOnce(mockErrorResponse(404, "Not Found"));

    const result = await getTranslation("missing.key", "default");

    expect(result).toEqual({
      key: "missing.key",
      isPlural: false,
      translations: {},
      metadata: {
        createdAt: "2026-03-04T05:06:07.008Z",
      },
    });
  });

  it("should throw normalized error when getTranslation receives non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    await expect(getTranslation("home.title", "default")).rejects.toThrow(
      "Failed to fetch translation",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Error fetching translation:",
      new Error("API error: 500 Server Error"),
    );
  });

  it("should throw normalized error when saveTranslation receives non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    await expect(
      saveTranslation("home.title", "default", { en: { other: "Hello" } }, false),
    ).rejects.toThrow("Failed to save translation");
    expect(console.error).toHaveBeenCalledWith(
      "Error saving translation:",
      new Error("API error: 500 Server Error"),
    );
  });

  it("should keep scoped API configs isolated across editor runtimes", async () => {
    initApiConfig("runtime-a-key", "runtime-a");
    initApiConfig("runtime-b-key", "runtime-b");

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockOkResponse(makeKeyResponse({ key: "home.title" })));

    await getTranslation("home.title", "default", "runtime-a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    fetchMock.mockResolvedValueOnce(mockOkResponse(makeKeyResponse({ key: "home.title" })));

    await saveTranslation("home.title", "default", { en: { other: "Updated title" } }, false);

    expect(sentBody(fetchMock).translations.en.value).toBe("Updated title");
  });

  it("should send select-only translations as ICU select", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockOkResponse(makeKeyResponse({ key: "welcome.message" })));

    await saveTranslation(
      "welcome.message",
      "default",
      { en: { formal: "Welcome", informal: "Hi" } },
      false,
      undefined,
      { en: { enabled: true, variable: "formality", options: ["formal", "informal"] } },
    );

    expect(sentBody(fetchMock).translations.en).toEqual({
      value: "{formality, select, formal {Welcome} informal {Hi}}",
      status: "not_reviewed",
    });
  });

  it("should throw demo mode error when trying to save in demo mode", async () => {
    initApiConfig(undefined);

    await expect(
      saveTranslation("home.title", "default", { en: { other: "Hello" } }, false),
    ).rejects.toMatchObject({
      name: "DemoModeError",
      message:
        "[Demo Mode] Saving translations is not available. Please configure an API key to enable this feature.",
    });
    await expect(
      saveTranslation("home.title", "default", { en: { other: "Hello" } }, false),
    ).rejects.toBeInstanceOf(DemoModeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should throw demo mode error when trying to delete in demo mode", async () => {
    initApiConfig(undefined);

    await expect(deleteTranslation("home.title", "default")).rejects.toMatchObject({
      name: "DemoModeError",
      message:
        "[Demo Mode] Deleting translations is not available. Please configure an API key to enable this feature.",
    });
    await expect(deleteTranslation("home.title", "default")).rejects.toBeInstanceOf(DemoModeError);
    expect(fetch).not.toHaveBeenCalled();
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
    vi.mocked(fetch).mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

    await expect(deleteTranslation("home.title", "default")).rejects.toThrow(
      "Failed to delete translation",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Error deleting translation:",
      new Error("API error: 500 Server Error"),
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

  it("should return empty array when the project has no namespaces", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ locales: [], namespaces: {} }));

    await expect(getAllTranslationKeys()).resolves.toEqual([]);
  });

  it("should return empty array when getAllTranslationKeys fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockErrorResponse(500, "Server Error", {
        namespaces: { default: { en: { "home.title": "Home" } } },
      }),
    );

    const result = await getAllTranslationKeys();

    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      "Error getting translation keys:",
      new Error("API error: 500 Server Error"),
    );
  });

  it("should return empty array for getAllTranslationKeys in demo mode", async () => {
    initApiConfig(undefined);

    const result = await getAllTranslationKeys();

    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should pass description field from API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(
        makeKeyResponse({
          key: "home.title",
          description: "Main heading on the homepage",
          values: { en: "Welcome" },
        }),
      ),
    );

    const result = await getTranslation("home.title", "default");

    expect(result?.description).toBe("Main heading on the homepage");
  });

  it("should handle missing description field gracefully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(makeKeyResponse({ key: "home.title" })));

    const result = await getTranslation("home.title", "default");

    expect(result?.description).toBeUndefined();
  });

  it("should return null without calling the API in demo mode", async () => {
    initApiConfig(undefined);

    await expect(getTranslation("home.title", "default")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should map a singular value to a single other form", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(makeKeyResponse({ key: "home.title", values: { en: "Welcome" } })),
    );

    const result = await getTranslation("home.title", "default");

    expect(result).toEqual({
      key: "home.title",
      description: undefined,
      isPlural: false,
      pluralVariable: undefined,
      translations: { en: { other: "Welcome" } },
      selectConfigs: undefined,
      metadata: { createdAt: TIMESTAMP, lastModified: TIMESTAMP },
    });
  });

  it("should derive plural forms and the plural variable from a plural ICU value", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(
        makeKeyResponse({
          key: "cart.items",
          values: { en: "{count, plural, one {1 item} other {# items}}" },
        }),
      ),
    );

    const result = await getTranslation("cart.items", "default");

    expect(result).toEqual({
      key: "cart.items",
      description: undefined,
      isPlural: true,
      pluralVariable: "count",
      translations: { en: { one: "1 item", other: "# items" } },
      selectConfigs: undefined,
      metadata: { createdAt: TIMESTAMP, lastModified: TIMESTAMP },
    });
  });

  it("should derive the select options from a select ICU value", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(
        makeKeyResponse({
          key: "welcome.message",
          values: { en: "{formality, select, formal {Welcome} informal {Hi}}" },
        }),
      ),
    );

    const result = await getTranslation("welcome.message", "default");

    expect(result).toEqual({
      key: "welcome.message",
      description: undefined,
      isPlural: false,
      pluralVariable: undefined,
      translations: { en: { formal: "Welcome", informal: "Hi" } },
      selectConfigs: {
        en: { enabled: true, variable: "formality", options: ["formal", "informal"] },
      },
      metadata: { createdAt: TIMESTAMP, lastModified: TIMESTAMP },
    });
  });

  it("should keep the first language's plural variable when the languages disagree", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(
        makeKeyResponse({
          key: "cart.items",
          values: {
            en: "{count, plural, one {1 item} other {# items}}",
            de: "{n, plural, one {1 Artikel} other {# Artikel}}",
          },
        }),
      ),
    );

    const result = await getTranslation("cart.items", "default");

    expect(result?.pluralVariable).toBe("count");
  });

  it("should keep the requested key when the API echoes a different one", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse(makeKeyResponse({ key: "server.key", values: { en: "Hello" } })),
    );

    const result = await getTranslation("requested.key", "default");

    expect(result?.key).toBe("requested.key");
  });

  it("should send plural-only values as ICU plural with the given variable", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse(makeKeyResponse({ key: "cart.items", isPlural: true })),
    );

    await saveTranslation(
      "cart.items",
      "default",
      { en: { one: "1 item", other: "# items" } },
      true,
      "n",
    );

    expect(sentBody(fetchMock).translations.en).toEqual({
      value: "{n, plural, one {1 item} other {# items}}",
      status: "not_reviewed",
    });
  });

  it("should send an empty value when the singular form carries no text", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockOkResponse(makeKeyResponse({ key: "home.title" })));

    await saveTranslation("home.title", "default", { en: {} }, false);

    expect(sentBody(fetchMock).translations.en).toEqual({ value: "", status: "not_reviewed" });
  });

  it("should send the plural forms taken from the composite keys", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockOkResponse(makeKeyResponse({ key: "cart.items", isPlural: true })),
    );

    await saveTranslation(
      "cart.items",
      "default",
      { uk: { "formal:few": "# items", "formal:many": "# more items" } },
      true,
      "n",
      { uk: { enabled: true, variable: "formality", options: ["formal"] } },
    );

    expect(sentBody(fetchMock).translations.uk.value).toBe(
      "{formality, select, formal {{n, plural, few {# items} many {# more items}}}}",
    );
  });

  // Only `<option>:<form>` keys carry a plural form; anything else leaves the
  // combined value with the default one/other arms.
  it.each([
    ["no separator", { other: "Welcome" }],
    ["an empty plural form part", { "formal:": "junk" }],
    ["an extra separator", { "formal:few:legacy": "junk" }],
  ])(
    "should fall back to empty one/other arms when the only composite key has %s",
    async (_case, forms) => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        mockOkResponse(makeKeyResponse({ key: "home.title", isPlural: true })),
      );

      await saveTranslation("home.title", "default", { en: forms }, true, undefined, {
        en: { enabled: true, variable: "formality", options: ["formal"] },
      });

      expect(sentBody(fetchMock).translations.en.value).toBe(
        "{formality, select, formal {{count, plural, one {} other {}}}}",
      );
    },
  );
});
