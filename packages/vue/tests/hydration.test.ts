/**
 * Hydration from a server render (design §2.6, R3-21): the browser's instance starts from
 * `handover()` of the request's instance — `createI18n({ ...options, ...payload })` — so the
 * app hydrates with the server's text and asks the loader for nothing the server rendered.
 * It asks only for what the server did not send: another locale, a namespace a later view
 * activates. The control case (no payload) shows what the gate catches: a hydration
 * mismatch and requests for every catalog. The built-app, real-browser gate of R3-21 is
 * `pnpm --filter @comvi/vue test:e2e` (e2e/ssr-handover.spec.ts).
 */
import { createSSRApp, defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
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

const showHelp = ref(false);
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
const serve = async (locale: string) => {
  const i18n = createI18n({ ...OPTIONS, locale, loader: loader() });
  const html = await renderToString(createSSRApp(App).use(i18n));
  return { html, payload: JSON.parse(JSON.stringify(handover(i18n))) as Handover };
};

const hydrate = async (html: string, options: Parameters<typeof createI18n>[0]) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  const i18n = createI18n(options);
  const warnings = await vueWarnings(async () => {
    createSSRApp(App).use(i18n).mount(el);
    await settle();
  });
  return { el, i18n, warnings };
};

describe("hydration from handover()", () => {
  it("hydrates with the server's text and makes 0 catalog requests", async () => {
    showHelp.value = false;
    const { html, payload } = await serve("uk");
    const server = html;
    const load = loader();
    const { el, warnings } = await hydrate(html, { ...OPTIONS, ...payload, loader: load });
    expect(warnings).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(el.innerHTML).toBe(server);
    expect(el.textContent).toBe("Привіт, Ann!Only EnglishПрофіль");
  });

  it("asks only for what the server did not send: a later view's namespace, another locale", async () => {
    showHelp.value = false;
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
    showHelp.value = false;
  });

  it("control: without the payload the client mismatches the server and refetches every catalog", async () => {
    showHelp.value = false;
    const { html } = await serve("uk");
    const load = loader();
    const { warnings } = await hydrate(html, { ...OPTIONS, locale: "uk", loader: load });
    expect(warnings.join("\n")).toMatch(/[Hh]ydration/);
    expect(load.mock.calls.length).toBeGreaterThan(0);
  });
});
