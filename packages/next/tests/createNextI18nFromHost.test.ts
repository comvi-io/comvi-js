// framework-slim P5 step 4 — the root-free server companion.
//
// Everything here runs against a COMPOSED host (`@comvi/core/slim` +
// `attachLoader`), never the root entry: that is the configuration the
// `fw-next-server-slim-loader` fixture measures, and the reason the companion
// exists at all.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { createNextI18nFromHost, getI18n, loadTranslations } from "../src/server";
import { _resetServerI18n, getI18nInstance, setI18n } from "../src/server/cache";

const ROUTING = { locales: ["en", "fr"], defaultLocale: "en" };

const composedHost = (translation?: Record<string, Record<string, string>>) =>
  attachLoader(
    createI18n({
      locale: "en",
      defaultNs: "common",
      exposeGlobal: false,
      devMode: false,
      translation,
    }),
  );

beforeEach(() => {
  _resetServerI18n();
});

describe("createNextI18nFromHost — lazy trigger", () => {
  it("does not call host() while assembling the result", () => {
    const host = vi.fn(() => composedHost());

    const result = createNextI18nFromHost(host, ROUTING);

    expect(host).toHaveBeenCalledTimes(0);
    expect(result.routing.defaultLocale).toBe("en");
    expect(result.routing.localeCookie).toBe("NEXT_LOCALE");
    expect(host).toHaveBeenCalledTimes(0);
  });

  it("triggers host() exactly once from the server helpers, with no prior result.i18n access", async () => {
    const host = vi.fn(() => composedHost({ "fr:common": { greeting: "Bonjour" } }));
    createNextI18nFromHost(host, ROUTING);

    const messages = await loadTranslations("fr", { namespaces: ["common"] });
    const { t } = await getI18n({ locale: "fr" });

    expect(host).toHaveBeenCalledTimes(1);
    expect(messages["fr:common"]).toEqual({ greeting: "Bonjour" });
    expect(t("greeting")).toBe("Bonjour");
  });

  it("triggers host() exactly once from result.i18n, and both entry points share the instance", () => {
    const host = vi.fn(() => composedHost());
    const result = createNextI18nFromHost(host, ROUTING);

    const first = result.i18n;

    expect(host).toHaveBeenCalledTimes(1);
    expect(result.i18n).toBe(first);
    expect(getI18nInstance()).toBe(first);
    expect(host).toHaveBeenCalledTimes(1);
  });

  it("calls host() once when two concurrent renders race the first trigger", async () => {
    const host = vi.fn(() => composedHost({ "en:common": { greeting: "Hello" } }));
    const result = createNextI18nFromHost(host, ROUTING);

    const [renderA, renderB] = await Promise.all([
      getI18n({ locale: "en" }),
      loadTranslations("en", { namespaces: ["common"] }),
    ]);

    expect(host).toHaveBeenCalledTimes(1);
    expect(renderA.t("greeting")).toBe("Hello");
    expect(renderB["en:common"]).toEqual({ greeting: "Hello" });
    expect(getI18nInstance()).toBe(result.i18n);
  });
});

describe("createNextI18nFromHost — server render on a slim + loader host", () => {
  // The default locale/namespace is seeded so `init()` has nothing to fetch:
  // every loader call below is one the request actually caused.
  const hostWithLoader =
    (loader: (locale: string, namespace: string) => Promise<unknown>) => () => {
      const host = composedHost({ "en:common": { __seed: "seed" } });
      host.registerLoader(loader as never);
      return host;
    };

  it("loads translations through the host's registered loader", async () => {
    const loader = vi.fn(async (locale: string, namespace: string) =>
      locale === "fr" && namespace === "common" ? { greeting: "Bonjour" } : {},
    );
    createNextI18nFromHost(hostWithLoader(loader), ROUTING);

    const messages = await loadTranslations("fr", { namespaces: ["common"] });

    expect(messages["fr:common"]).toEqual({ greeting: "Bonjour" });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith("fr", "common");
  });

  it("preserves the translation cache across requests", async () => {
    const loader = vi.fn(async () => ({ greeting: "Bonjour" }));
    createNextI18nFromHost(hostWithLoader(loader), ROUTING);

    const first = await loadTranslations("fr", { namespaces: ["common"] });
    const second = await loadTranslations("fr", { namespaces: ["common"] });

    expect(first["fr:common"]).toEqual({ greeting: "Bonjour" });
    expect(second["fr:common"]).toEqual({ greeting: "Bonjour" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("serializes translations as plain objects for the client boundary", async () => {
    createNextI18nFromHost(() => composedHost({ "fr:common": { greeting: "Bonjour" } }), ROUTING);

    const messages = await loadTranslations("fr", { namespaces: ["common"] });

    expect(Object.getPrototypeOf(messages["fr:common"])).toBe(Object.prototype);
  });
});

describe("createNextI18nFromHost — export boundary", () => {
  it("is reachable as @comvi/next/server and nowhere else", async () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as {
      exports: Record<string, { default: string }>;
    };

    // The specifier every fixture, doc and changeset names.
    expect(pkg.exports["./server"].default).toBe("./dist/server.js");

    const serverEntry = await import("../src/server");
    const rootEntry = await import("../src/index");
    const clientEntry = await import("../src/client");

    expect(typeof serverEntry.createNextI18nFromHost).toBe("function");
    expect("createNextI18nFromHost" in rootEntry).toBe(false);
    expect("createNextI18nFromHost" in clientEntry).toBe(false);
  });

  it("keeps the suite-only cell reset out of the public server entry", async () => {
    const serverEntry = await import("../src/server");

    expect("_resetServerI18n" in serverEntry).toBe(false);
    expect(typeof _resetServerI18n).toBe("function");
  });

  it("has no .use* plugin methods on the result", () => {
    const result = createNextI18nFromHost(() => composedHost(), ROUTING) as unknown as Record<
      string,
      unknown
    >;

    expect(Object.keys(result).sort()).toEqual(["i18n", "routing"]);
    for (const method of ["use", "useClient", "useServer", "useClientLazy", "useServerLazy"]) {
      expect(result[method]).toBeUndefined();
    }
  });
});

describe("createNextI18nFromHost — legacy setI18n interop", () => {
  it("still resolves an instance registered the old way", async () => {
    const host = composedHost({ "fr:common": { greeting: "Bonjour" } });

    setI18n(host as never);

    const { t } = await getI18n({ locale: "fr" });
    expect(t("greeting")).toBe("Bonjour");
  });

  it("throws the not-configured error naming both configuration paths", () => {
    expect(() => getI18nInstance()).toThrow(/i18n not configured/);
    expect(() => getI18nInstance()).toThrow(/createNextI18nFromHost/);
  });
});
