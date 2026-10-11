import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, isRef, nextTick, watch, type App } from "vue";
import { createI18n as createVueI18n, useI18n } from "@comvi/vue";
import * as nuxtAppMocks from "./mocks/nuxt-app";
import { resetMocks, setMockI18n, setMockRoute } from "./mocks/nuxt-app";
import { useLocaleHead } from "../src/runtime/composables/useLocaleHead";

const createComviI18n = vi.fn();

vi.mock("#build/comvi.i18n", () => ({
  createComviI18n,
}));

const catalog = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
  ar: { greeting: "مرحبا" },
};

type HtmlAttrs = Record<string, string>;

/** Every head entry registered, so a test reads what the SSR head would render. */
let headEntries: unknown[] = [];

function htmlAttrsOf(entry: unknown): HtmlAttrs | undefined {
  const head = (isRef(entry) ? entry.value : entry) as { htmlAttrs?: unknown } | undefined;
  const attrs = head?.htmlAttrs;
  return (isRef(attrs) ? attrs.value : attrs) as HtmlAttrs | undefined;
}

/** The `<html>` attributes the SSR head renders: every entry merged, later wins. */
function renderedHtmlAttrs(): HtmlAttrs {
  return Object.assign({}, ...headEntries.map(htmlAttrsOf).filter(Boolean));
}

/**
 * The client head renderer as Nuxt ships it: it patches the DOM a task after
 * Vue's render (see locale-head-sync.test.ts), so whatever a test sees after
 * `nextTick()` is what the next frame would paint.
 */
function installHeadRenderer() {
  vi.spyOn(nuxtAppMocks, "useHead").mockImplementation((input: any) => {
    headEntries.push(input);
    watch(
      () => htmlAttrsOf(input),
      (attrs) => {
        setTimeout(() => {
          for (const [name, value] of Object.entries(attrs ?? {})) {
            document.documentElement.setAttribute(name, value);
          }
        }, 0);
      },
      { immediate: true },
    );
    return input;
  });
}

let app: App | undefined;

async function setupPlugin() {
  createComviI18n.mockImplementation((options: Record<string, unknown>) =>
    createVueI18n({ ...options, messages: catalog, exposeGlobal: false } as never),
  );
  const plugin = (await import("../src/runtime/plugin")).default;
  const { provide } = (await plugin.setup({
    vueApp: { use: vi.fn() },
    hook: vi.fn(),
    payload: {},
  } as never)) as { provide: { i18n: any } };
  setMockI18n(provide.i18n);
  return provide.i18n;
}

/** A page that renders a key; `withLocaleHead` also calls `useLocaleHead()`. */
async function mountPage(withLocaleHead = false) {
  const i18n = await setupPlugin();
  const Page = defineComponent({
    setup() {
      if (withLocaleHead) {
        useLocaleHead({ addAlternateLinks: false, addCanonical: false, addOgLocale: false });
      }
      const { t } = useI18n();
      return () => h("p", { id: "text" }, t("greeting"));
    },
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp(Page);
  app.use(i18n);
  app.mount(host);
  // Server-rendered state: the SSR head already wrote the attributes.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { i18n, text: () => host.querySelector("#text")!.textContent };
}

describe("plugin: <html lang dir> from the active locale (comvi.head)", () => {
  beforeEach(() => {
    resetMocks();
    headEntries = [];
    nuxtAppMocks.mockRuntimeConfig.public.comvi.locales = ["en", "uk", "ar"];
    setMockRoute({ path: "/", fullPath: "/" });
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
    installHeadRenderer();
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    app?.unmount();
    app = undefined;
    document.body.innerHTML = "";
  });

  it("renders lang and dir into the SSR head with no useLocaleHead() call", async () => {
    vi.stubGlobal("__COMVI_TEST_SERVER__", true);
    await setupPlugin();

    expect(renderedHtmlAttrs()).toEqual({ lang: "en", dir: "ltr" });
  });

  it("renders dir=rtl and the locale's iso tag on the server", async () => {
    vi.stubGlobal("__COMVI_TEST_SERVER__", true);
    nuxtAppMocks.mockRuntimeConfig.public.comvi.defaultLocale = "ar";
    nuxtAppMocks.mockRuntimeConfig.public.comvi.localeObjects = {
      ar: { code: "ar", iso: "ar-EG" },
    };
    await setupPlugin();

    expect(renderedHtmlAttrs()).toEqual({ lang: "ar-EG", dir: "rtl" });
  });

  it("switches lang and dir in the commit that switches the text", async () => {
    const { i18n, text } = await mountPage();
    expect(document.documentElement.lang).toBe("en");

    await i18n.setLocale("ar");
    await nextTick();

    expect(text()).toBe("مرحبا");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("writes nothing with head: false", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.head = false;
    const { i18n } = await mountPage();

    await i18n.setLocale("ar");
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(headEntries).toEqual([]);
    expect(document.documentElement.hasAttribute("lang")).toBe(false);
    expect(document.documentElement.hasAttribute("dir")).toBe(false);
  });

  it("agrees with useLocaleHead() and writes each attribute once per switch", async () => {
    const { i18n } = await mountPage(true);
    // Two entries, the plugin's and the page's, carrying the same values.
    const values = headEntries.map(htmlAttrsOf).filter(Boolean);
    expect(values).toEqual([
      { lang: "en", dir: "ltr" },
      { lang: "en", dir: "ltr" },
    ]);

    const writes: string[] = [];
    const setAttribute = document.documentElement.setAttribute.bind(document.documentElement);
    vi.spyOn(document.documentElement, "setAttribute").mockImplementation((name, value) => {
      writes.push(`${name}=${value}`);
      setAttribute(name, value);
    });

    await i18n.setLocale("ar");
    await nextTick();

    expect(writes).toEqual(["lang=ar", "dir=rtl"]);
    expect(renderedHtmlAttrs()).toEqual({ lang: "ar", dir: "rtl" });
  });
});
