/**
 * Hydration from a server render (design §2.6, R3-21): the browser's instance starts from
 * `handover()` of the request's instance — `createI18n({ ...options, ...payload })` — so the
 * app hydrates with the server's text and asks the loader for nothing the server rendered.
 * It asks only for what the server did not send: another locale, a namespace a later view
 * activates. The control case (no payload) shows what the gate catches: a hydration
 * mismatch and requests for every catalog. The built-app, real-browser gate of R3-21 is
 * `pnpm --filter @comvi/vue test:e2e` (e2e/run.mjs).
 */
import {
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App as VueApp,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, handover, useI18n, type Catalog, type Handover } from "../src";
import { settle, vueWarnings } from "./helpers";

const CATALOGS: Record<string, Catalog> = {
  "uk:default": { hi: "Привіт, {name}!" },
  "en:default": { hi: "Hello, {name}!", only: "Only English" },
  "uk:account": { title: "Профіль" },
  "en:account": { title: "Account" },
  "uk:help": { faq: "Питання" },
  "en:help": { faq: "Questions" },
};
const loader = () =>
  vi.fn(async (locale: string, ns: string) => {
    const c = CATALOGS[`${locale}:${ns}`];
    if (!c) throw new Error(`404 ${locale}:${ns}`);
    return c;
  });

/** Whether the app shows the help view (its own `help` namespace); per test, see `fresh()`. */
let showHelp = ref(false);
const Help = defineComponent({
  setup() {
    const { t } = useI18n("help");
    return () => h("aside", t("faq"));
  },
});
const App = defineComponent({
  setup() {
    const { t } = useI18n();
    const account = useI18n("account");
    return () =>
      h("main", [
        h("p", t("hi", { name: "Ann" })),
        h("p", t("only")),
        h("h2", account.t("title")),
        showHelp.value ? h(Help) : null,
      ]);
  },
});
const OPTIONS = { fallbackLocale: "en", timeZone: "UTC" };

/** The server's response: the HTML and the payload the page embeds. */
const serve = async (locale: string, load = loader()) => {
  const i18n = createI18n({ ...OPTIONS, locale, loader: load });
  // The locale's catalogs; `useI18n("account")` loads its namespace before it renders
  // (lot 4b: onServerPrefetch), so the route needs no `i18n.load("account")`.
  await i18n.ready;
  const html = await renderToString(createSSRApp(App).use(i18n));
  const payload = JSON.parse(JSON.stringify(handover(i18n))) as Handover;
  i18n.destroy();
  return { html, payload };
};

/** What a test mounted: unmounted and destroyed after it, so no app outlives its case. */
const mounted: [VueApp, ReturnType<typeof createI18n>][] = [];
afterEach(() => {
  for (const [app, i18n] of mounted.splice(0)) {
    app.unmount();
    i18n.destroy();
  }
  showHelp = ref(false);
});

const hydrate = async (html: string, options: Parameters<typeof createI18n>[0]) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  const i18n = createI18n(options);
  const app = createSSRApp(App).use(i18n);
  mounted.push([app, i18n]);
  const warnings = await vueWarnings(async () => {
    app.mount(el);
    await settle();
  });
  return { el, i18n, warnings };
};

describe("hydration from handover()", () => {
  it("hydrates with the server's text and makes 0 catalog requests", async () => {
    const { html, payload } = await serve("uk");
    const server = html;
    const load = loader();
    const { el, warnings } = await hydrate(html, { ...OPTIONS, ...payload, loader: load });
    expect(warnings).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(el.innerHTML).toBe(server);
    expect(el.textContent).toBe("Привіт, Ann!Only EnglishПрофіль");
  });

  it("inline `messages` with the payload (Codex re-check HIGH B): the payload's slots win, 0 requests, no mismatch", async () => {
    // The app ships en inline (`messages`) and spreads the server's payload over its options:
    // the inline en must not replace the handed-over uk of the same namespace.
    const INLINE = { en: CATALOGS["en:default"] };
    const load0 = loader();
    const server = createI18n({ ...OPTIONS, locale: "uk", messages: INLINE, loader: load0 });
    await server.ready;
    const html = await renderToString(createSSRApp(App).use(server));
    const payload = JSON.parse(JSON.stringify(handover(server))) as Handover;
    server.destroy();
    expect(html).toContain("Привіт, Ann!");
    const load = loader();
    // The app's own options (its locale is en), then the payload over them.
    const app = { ...OPTIONS, locale: "en", messages: INLINE };
    const { el, warnings } = await hydrate(html, { ...app, ...payload, loader: load });
    expect(warnings).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(el.innerHTML).toBe(html);
  });

  it("asks only for what the server did not send: a later view's namespace, another locale", async () => {
    const { html, payload } = await serve("uk");
    const load = loader();
    const { el, i18n } = await hydrate(html, { ...OPTIONS, ...payload, loader: load });
    showHelp.value = true;
    await nextTick();
    await settle();
    expect(load.mock.calls.map(([l, n]) => `${l}:${n}`)).toEqual(["uk:help", "en:help"]);
    expect(el.querySelector("aside")!.textContent).toBe("Питання");
    // en:default and en:account came with the payload (the fallback chain): only help.
    await i18n.setLocale("en");
    await settle();
    expect(load.mock.calls.map(([l, n]) => `${l}:${n}`)).toEqual(["uk:help", "en:help"]);
  });

  it("a namespace the server served through the fallback chain is not asked for again", async () => {
    // uk:account is not translated (404): the server rendered en:account's title.
    const partial = vi.fn(async (locale: string, ns: string) => {
      if (locale == "uk" && ns == "account") throw new Error("404 uk:account");
      return CATALOGS[`${locale}:${ns}`];
    });
    const { html, payload } = await serve("uk", partial);
    expect(html).toContain("<h2>Account</h2>");
    const load = loader();
    const { el, warnings } = await hydrate(html, { ...OPTIONS, ...payload, loader: load });
    expect(warnings).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(el.innerHTML).toBe(html);
  });

  it.each(["useI18n", "useI18n(ns).T"])(
    "a namespace whose catalog was inline on the server (%s) is handed over: 0 requests, no mismatch",
    async (api) => {
      // Nobody preloads `shop`: its catalog is inline; only the server's render holds it.
      const Shop = defineComponent({
        setup() {
          const { t, T: B } = useI18n("shop");
          if (api == "useI18n") return () => h("p", t("cart"));
          return () => h(B as Component, { i18nKey: "cart" });
        },
      });
      const inline = { shop: { uk: { cart: "Кошик" }, en: { cart: "Cart" } } };
      const server = createI18n({ ...OPTIONS, locale: "uk", catalogs: inline, loader: loader() });
      await server.ready;
      const html = await renderToString(createSSRApp(Shop).use(server));
      expect(html).toContain("Кошик");
      const payload = JSON.parse(JSON.stringify(handover(server))) as Handover;
      expect(Object.keys(payload.catalogs)).toContain("shop");
      const el = document.createElement("div");
      el.innerHTML = html;
      const load = loader();
      const client = createI18n({ ...OPTIONS, ...payload, loader: load });
      const app = createSSRApp(Shop).use(client);
      mounted.push([app, client]);
      const warnings = await vueWarnings(async () => {
        app.mount(el);
        await settle();
      });
      expect(warnings).toEqual([]);
      expect(el.innerHTML).toBe(html);
      expect(load).not.toHaveBeenCalled();
    },
  );

  it("control: without the payload the client mismatches the server and refetches every catalog", async () => {
    const { html } = await serve("uk");
    const load = loader();
    const { warnings } = await hydrate(html, { ...OPTIONS, locale: "uk", loader: load });
    expect(warnings.join("\n")).toMatch(/[Hh]ydration/);
    expect(load.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("hydration of a per-call { locale } outside the locale on screen (owner 30.10)", () => {
  const PerCall = defineComponent({
    setup() {
      const { t } = useI18n();
      return () =>
        h("main", [
          h("p", t("hi", { locale: "uk" }) as string),
          h("p", t("a", { locale: "de-CH" }) as string),
          h("p", t("b", { locale: "de-CH" }) as string),
        ]);
    },
  });
  const options = {
    timeZone: "UTC",
    fallbackLocale: { "de-CH": ["fr"], default: ["en"] },
  };

  it.each(["inline", "loaded"] as const)(
    "%s catalogs: the same text, no mismatch, 0 requests; a later switch loads only the active namespace",
    async (how) => {
      const server = createI18n({
        ...options,
        locale: "en",
        ...(how == "inline"
          ? {
              catalogs: {
                default: { en: {}, uk: { hi: "Привіт" }, de: { a: "A-de" }, fr: { b: "B-fr" } },
              },
              loader: async () => ({}),
            }
          : {
              loader: async (l: string) =>
                (
                  ({
                    en: {},
                    uk: { hi: "Привіт" },
                    de: { a: "A-de" },
                    fr: { b: "B-fr" },
                  }) as Record<string, Catalog>
                )[l] || {},
            }),
      });
      await server.ready;
      if (how == "loaded") for (const l of ["uk", "de", "fr", "en"]) await server.setLocale(l); // cached
      const html = await renderToString(createSSRApp(PerCall).use(server));
      expect(html).toBe("<main><p>Привіт</p><p>A-de</p><p>B-fr</p></main>");
      const payload = JSON.parse(JSON.stringify(handover(server))) as Handover;
      const el = document.createElement("div");
      el.innerHTML = html;
      const load = vi.fn<(l: string, n: string) => Promise<Record<string, string>>>(
        async () => ({}),
      );
      const i18n = createI18n({ ...options, ...payload, loader: load });
      const app = createSSRApp(PerCall).use(i18n);
      mounted.push([app, i18n]);
      const warnings = await vueWarnings(async () => {
        app.mount(el);
        await settle();
      });
      expect([el.innerHTML, warnings, load.mock.calls.length, i18n.locale]).toEqual([
        html,
        [],
        0,
        "en",
      ]);
      await i18n.setLocale("it");
      expect(load.mock.calls.map(([l, n]) => `${l}:${n}`)).toEqual(["it:default"]);
    },
  );
});
