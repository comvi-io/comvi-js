/**
 * What every outgoing request carries: the auth headers the loader builds, and
 * the SSR cache hints (`next`) a framework host asked for.
 */
import { describe, it, expect, vi } from "vitest";
import { FetchLoader, fetchApiTranslations } from "../src/index";
import type { FetchLoaderOptions } from "../src/index";
import { I18n } from "./helpers/composedHost";
import { jsonResponse, recordingTransport } from "./helpers/transport";
import { mockCdnSuccessResponse, TEST_CDN_URL } from "./setup";

const BASE = "https://api.example.com";
const TRANSLATIONS = { namespaces: { default: { en: { hello: "Hi" } } } };

/** Installs the plugin in CDN mode and hands back the init of its one request. */
async function cdnRequestInit(cache: FetchLoaderOptions["cache"]) {
  const i18n = new I18n({ locale: "en", devMode: false });
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  mockCdnSuccessResponse("en", "default", { key: "value" });

  await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true, cache })(i18n);

  const call = fetchSpy.mock.calls.find(([input]) => String(input).endsWith("/en.json"));
  return call?.[1] as (RequestInit & { next?: unknown }) | undefined;
}

describe("request headers", () => {
  it("sends the API key as a Bearer token alongside the JSON Accept header", async () => {
    const { fetchFn, calls } = recordingTransport(() => jsonResponse(TRANSLATIONS));

    await fetchApiTranslations("secret-key", "en", ["default"], BASE, 5000, fetchFn);

    expect(calls[0]?.init?.headers).toStrictEqual({
      Accept: "application/json",
      Authorization: "Bearer secret-key",
    });
  });

  it("sends no Authorization header when the transport owns the credential", async () => {
    const { fetchFn, calls } = recordingTransport(() => jsonResponse(TRANSLATIONS));

    await fetchApiTranslations("", "en", ["default"], BASE, 5000, fetchFn, "scope-proxy");

    expect(calls[0]?.init?.headers).toStrictEqual({ Accept: "application/json" });
  });
});

describe("SSR cache options", () => {
  it("forwards revalidate alone when no tags are configured", async () => {
    const init = await cdnRequestInit({ revalidate: 3600 });

    expect(init?.next).toStrictEqual({ revalidate: 3600 });
  });

  it("forwards tags alone when no revalidate is configured", async () => {
    const init = await cdnRequestInit({ tags: ["i18n"] });

    expect(init?.next).toStrictEqual({ tags: ["i18n"] });
  });

  it("drops an empty tags list and keeps a zero revalidate", async () => {
    const init = await cdnRequestInit({ revalidate: 0, tags: [] });

    expect(init?.next).toStrictEqual({ revalidate: 0 });
  });
});
