import { describe, it, expect } from "vitest";
import { FetchLoader, getFetchLoaderConfig, resolveFallback } from "../src/index";
import { I18n } from "./helpers/composedHost";
import { mockCdnSuccessResponse, TEST_CDN_URL } from "./setup";

describe("getFetchLoaderConfig()", () => {
  it("returns the options the installed plugin was built with", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    mockCdnSuccessResponse("en", "default", { hello: "Hello" });

    await FetchLoader({ cdnUrl: TEST_CDN_URL, timeout: 1234, loadOnInit: true })(i18n);

    expect(getFetchLoaderConfig(i18n)).toEqual({
      cdnUrl: TEST_CDN_URL,
      timeout: 1234,
      loadOnInit: true,
    });
  });

  it("returns undefined on a host the plugin was never installed on", () => {
    const i18n = new I18n({ locale: "en", devMode: false });

    expect(getFetchLoaderConfig(i18n)).toBeUndefined();
  });
});

describe("resolveFallback()", () => {
  const exact = () => Promise.resolve({ default: { key: "exact" } });
  const shorthand = () => Promise.resolve({ default: { key: "shorthand" } });

  it("prefers the exact locale:namespace entry over the locale shorthand", () => {
    expect(
      resolveFallback({ "en:default": exact, en: shorthand }, "en", "default", "default"),
    ).toBe(exact);
  });

  it("accepts the locale shorthand for the default namespace", () => {
    expect(resolveFallback({ en: shorthand }, "en", "default", "default")).toBe(shorthand);
  });

  it("ignores the locale shorthand for a non-default namespace", () => {
    expect(resolveFallback({ en: shorthand }, "en", "dashboard", "default")).toBeUndefined();
  });

  it("returns undefined when no fallback map was configured", () => {
    expect(resolveFallback(undefined, "en", "default", "default")).toBeUndefined();
  });
});
