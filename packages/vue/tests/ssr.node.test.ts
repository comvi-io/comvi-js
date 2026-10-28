/**
 * Server rendering (design §2.6, R3-18(3), R3-21; lot 4 gate "SSR smoke createSSRApp").
 * Ported by meaning from 0.7 ssr-locale-loader.test.ts and ssr-locale-failed-load.test.ts:
 * a server render waits for the catalogs it needs and renders them, never keys; a failed
 * load renders the keys and reports. New in 0.8: an instance per request (the app factory
 * makes both), the handover payload, and the development guard against one instance
 * installed into two apps on a server. Runs with no DOM (environment node).
 */
import { createSSRApp, defineComponent, h, version } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { createI18n, handover, T, useI18n, type Catalog, type I18nError } from "../src";

const CATALOGS: Record<string, Catalog> = {
  "en:default": { hi: "Hello, {name}!", terms: "Read the <link>terms</link>." },
  "de:default": { hi: "Hallo, {name}!", terms: "Lies die <link>AGB</link>." },
  "en:account": { title: "Account" },
  "de:account": { title: "Konto" },
};
/** A loader that answers after a macrotask, like a network: the render must wait for it. */
const loader =
  (requested: string[] = []) =>
  async (locale: string, ns: string) => {
    requested.push(`${locale}:${ns}`);
    await new Promise((y) => setTimeout(y, 5));
    const c = CATALOGS[`${locale}:${ns}`];
    if (!c) throw new Error(`404 ${locale}:${ns}`);
    return c;
  };

const Account = defineComponent({
  setup() {
    const { t } = useI18n("account");
    return () => h("h2", t("title"));
  },
});
const App = defineComponent({
  setup() {
    const { t, locale } = useI18n();
    return () =>
      h("main", { lang: locale.value }, [
        h("p", t("hi", { name: "Ann" })),
        h(
          T as never,
          { i18nKey: "terms" },
          { link: ({ children }: { children: string }) => h("a", children) },
        ),
        h(Account),
      ]);
  },
});

/** The request handler of a server: an instance and an app per request. */
const handle = async (locale: string, requested?: string[]) => {
  const i18n = createI18n({ locale, loader: loader(requested), timeZone: "UTC" });
  const html = await renderToString(createSSRApp(App).use(i18n));
  return { html, i18n };
};

describe("server render", () => {
  it("runs on Vue 3.5", () => expect(version.split(".").slice(0, 2).join(".")).toBe("3.5"));

  it("waits for the locale's catalogs and the namespaces components ask for, then renders them", async () => {
    const requested: string[] = [];
    const { html } = await handle("de", requested);
    expect(html).toBe(
      '<main lang="de"><p>Hallo, Ann!</p><!--[-->Lies die <!--[--><a>AGB</a><!--]-->.<!--]--><h2>Konto</h2></main>',
    );
    expect(requested.sort()).toEqual(["de:account", "de:default"]);
  });

  it("a failed load renders the keys and reports load_failed (0.7 ssr-locale-failed-load)", async () => {
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "fr",
      loader: loader(),
      timeZone: "UTC",
      onError: (e) => errors.push(e),
    });
    const html = await renderToString(createSSRApp(App).use(i18n));
    expect(html).toContain("<p>hi</p>");
    expect(errors.map((e) => e.code)).toContain("load_failed");
  });

  it("two concurrent requests in different locales do not bleed (an instance per request)", async () => {
    const out = await Promise.all(
      Array.from({ length: 20 }, (_, n) => handle(n % 2 ? "de" : "en").then((r) => r.html)),
    );
    out.forEach((html, n) =>
      expect(html).toContain(n % 2 ? "<p>Hallo, Ann!</p>" : "<p>Hello, Ann!</p>"),
    );
  });

  it("one instance installed into a second app on the server throws (development, R3-18(3))", async () => {
    const shared = createI18n({ locale: "en", messages: { en: { hi: "Hi" } }, timeZone: "UTC" });
    createSSRApp(App).use(shared);
    expect(() => createSSRApp(App).use(shared)).toThrow(
      "[@comvi/vue] an instance is installed into a second app on the server",
    );
  });
});

describe("handover() (R3-21)", () => {
  it("hands over the locale, the time zone, the clock and the catalogs the render used", async () => {
    const { i18n } = await handle("de");
    const payload = handover(i18n);
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      locale: "de",
      timeZone: "UTC",
      now: payload.now,
      catalogs: {
        default: { de: CATALOGS["de:default"] },
        account: { de: CATALOGS["de:account"] },
      },
    });
    expect(typeof payload.now).toBe("number");
  });

  it("hands over the fallback chain too, and only the active namespaces of the locale's chain", async () => {
    const i18n = createI18n({
      locale: "de-AT",
      fallbackLocale: "en",
      timeZone: "UTC",
      now: 42,
      catalogs: {
        default: { "de-AT": { a: "A" }, de: { b: "B" }, en: { c: "C" }, fr: { d: "D" } },
        // Not active: never rendered, not handed over.
        unused: { de: { x: "X" } },
      },
    });
    await renderToString(createSSRApp(App).use(i18n));
    const { catalogs, now } = handover(i18n);
    expect(now).toBe(42);
    // `account` is active (App renders it) but has no catalog: nothing to hand over.
    expect(Object.keys(catalogs)).toEqual(["default"]);
    expect(Object.keys(catalogs.default).sort()).toEqual(["de", "de-AT", "en"]);
    expect(catalogs.unused).toBeUndefined();
  });

  it("hands over a patched catalog as one catalog, the patch on top", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { a: "A", b: "B" } },
      timeZone: "UTC",
    });
    i18n.add("en", { b: "B2" });
    expect(handover(i18n).catalogs.default.en).toEqual({ a: "A", b: "B2" });
  });

  it("throws without a timeZone (development): server and browser must format dates in one zone", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } });
    expect(() => handover(i18n)).toThrow("[@comvi/core] a server render needs the timeZone option");
  });
});
