/**
 * The fallback chain in a browser that loads catalogs over the network: a key
 * the active locale lacks renders from the fallback locale, which means the
 * fallback locale's catalog has to be fetched, not only consulted.
 *
 * One CDN, every scenario: `en` is complete, `de` lacks `c` and has `empty`
 * published as an empty string (what the platform ships for an untranslated
 * value), `de-AT` and `fr` carry `a` only, and `xx` is not on the CDN at all.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { createI18n } from "@comvi/core";
import type { I18nOptions } from "@comvi/core";
import { cdnLoader } from "../src/index";
import { server, TEST_CDN_URL } from "./setup";

const CDN: Record<string, Record<string, string>> = {
  "en/default": { a: "A-en", b: "B-en", c: "C-en", empty: "E-en", blank: "" },
  "de/default": { a: "A-de", b: "B-de", empty: "", blank: "" },
  "de-AT/default": { a: "A-at" },
  "fr/default": { a: "A-fr" },
  "en/dashboard": { d: "D-en" },
  "de/dashboard": { x: "X-de" },
  "fr/dashboard": { x: "X-fr" },
};

/** Every `locale/namespace` the loader asked the CDN for, in order. */
let requested: string[];

beforeEach(() => {
  requested = [];
  server.use(
    http.get(`${TEST_CDN_URL}/*`, ({ request }) => {
      const [first, second] = new URL(request.url).pathname
        .replace(/^\/test-project-123\//, "")
        .replace(/\.json$/, "")
        .split("/");
      const key = second === undefined ? `${first}/default` : `${second}/${first}`;
      requested.push(key);
      const catalog = CDN[key];
      return catalog ? HttpResponse.json(catalog) : new HttpResponse("Not found", { status: 404 });
    }),
  );
});

const make = (options: I18nOptions) =>
  createI18n({ exposeGlobal: false, devMode: false, ...options }).use(
    cdnLoader({ cdnUrl: TEST_CDN_URL }),
  );

describe("fallback chain with the fetch loader: init()", () => {
  it("single fallback → a key the locale lacks renders from the fallback catalog", async () => {
    const i18n = make({ locale: "de", fallbackLocale: "en" });

    await i18n.init();

    expect(i18n.t("a")).toBe("A-de");
    expect(i18n.t("c")).toBe("C-en");
    expect([...requested].sort()).toEqual(["de/default", "en/default"]);
  });

  it("chain de-AT → de → en → each key renders from the first locale that has it", async () => {
    const i18n = make({ locale: "de-AT", fallbackLocale: ["de", "en"] });

    await i18n.init();

    expect([i18n.t("a"), i18n.t("b"), i18n.t("c")]).toEqual(["A-at", "B-de", "C-en"]);
    expect([...requested].sort()).toEqual(["de-AT/default", "de/default", "en/default"]);
  });

  it("fallback equal to the locale → one request, not two", async () => {
    const i18n = make({ locale: "en", fallbackLocale: "en" });

    await i18n.init();

    expect(requested).toEqual(["en/default"]);
  });

  it("no fallbackLocale → only the locale is requested", async () => {
    const i18n = make({ locale: "de" });

    await i18n.init();

    expect(requested).toEqual(["de/default"]);
  });

  it("hasTranslation() with checkFallbacks → true for a key only the fallback has", async () => {
    const i18n = make({ locale: "de", fallbackLocale: "en" });

    await i18n.init();

    expect(i18n.hasTranslation("c", undefined, undefined, true)).toBe(true);
  });

  it("fallback catalog missing from the CDN → init resolves and reports the load error", async () => {
    const onLoadError = vi.fn();
    const i18n = make({ locale: "de", fallbackLocale: "xx" });
    i18n.onLoadError(onLoadError);

    await i18n.init();

    expect(i18n.t("a")).toBe("A-de");
    expect(onLoadError).toHaveBeenCalledWith("xx", "default", expect.any(Error));
  });

  it("the locale's own catalog missing from the CDN → init still rejects", async () => {
    const i18n = make({ locale: "xx", fallbackLocale: "en" });

    await expect(i18n.init()).rejects.toThrow(/Failed to load all namespaces for locale "xx"/);
  });
});

describe("fallback chain with the fetch loader: after init()", () => {
  it("lazy namespace → loaded for the locale and for the fallback", async () => {
    const i18n = make({ locale: "de", fallbackLocale: "en" });
    await i18n.init();
    requested = [];

    await i18n.addActiveNamespace("dashboard");

    expect(i18n.t("d", { ns: "dashboard" })).toBe("D-en");
    expect([...requested].sort()).toEqual(["de/dashboard", "en/dashboard"]);
  });

  it("locale switch → the fallback keeps answering and is not fetched again", async () => {
    const i18n = make({ locale: "de", fallbackLocale: "en" });
    await i18n.init();
    requested = [];

    await i18n.setLocale("fr");

    expect([i18n.t("a"), i18n.t("c")]).toEqual(["A-fr", "C-en"]);
    expect(requested).toEqual(["fr/default"]);
  });

  it("chain set after init → loaded by the next reloadMessages()", async () => {
    const i18n = make({ locale: "de" });
    await i18n.init();
    i18n.setFallbackLocale("en");

    await i18n.reloadMessages();

    expect(i18n.t("c")).toBe("C-en");
  });
});

describe("fallback chain with the fetch loader: hydrating server-loaded messages", () => {
  it("payload holds the locale and the fallback → init requests nothing", async () => {
    const i18n = make({
      locale: "de",
      fallbackLocale: "en",
      messages: { de: CDN["de/default"], en: CDN["en/default"] },
    });

    await i18n.init();

    expect(i18n.t("c")).toBe("C-en");
    expect(requested).toEqual([]);
  });

  it("payload holds the locale only → init fetches the fallback it lacks", async () => {
    const i18n = make({
      locale: "de",
      fallbackLocale: "en",
      messages: { de: CDN["de/default"] },
    });

    await i18n.init();

    expect(i18n.t("c")).toBe("C-en");
    expect(requested).toEqual(["en/default"]);
  });

  it("namespace activated after hydration → loaded for the locale and the fallback", async () => {
    const i18n = make({
      locale: "de",
      fallbackLocale: "en",
      messages: { de: CDN["de/default"], en: CDN["en/default"] },
    });
    await i18n.init();

    await i18n.addActiveNamespace("dashboard");

    expect(i18n.t("d", { ns: "dashboard" })).toBe("D-en");
  });
});

describe("a value published as an empty string", () => {
  it("empty in the locale, text in the fallback → the fallback text", async () => {
    const i18n = make({ locale: "de", fallbackLocale: "en" });

    await i18n.init();

    expect(i18n.t("empty")).toBe("E-en");
  });

  it("empty in every locale of the chain → the key, as for a key missing everywhere", async () => {
    const i18n = make({ locale: "de", fallbackLocale: "en" });

    await i18n.init();

    expect(i18n.t("blank")).toBe("blank");
  });
});
