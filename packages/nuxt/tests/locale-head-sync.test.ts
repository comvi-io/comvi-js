import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, watch, type App } from "vue";
import { createI18n as createVueI18n, useI18n, type VueI18n } from "@comvi/vue";
import * as nuxtAppMocks from "./mocks/nuxt-app";
import { resetMocks, setMockI18n, setMockRoute } from "./mocks/nuxt-app";
import { useLocaleHead } from "../src/runtime/composables/useLocaleHead";

import { setComviOptions } from "./mocks/comvi-options";

// The real locale source: the binding's `locale` slice of the plugin's instance.
vi.unmock("../src/runtime/utils/locale");

/**
 * The client head renderer as Nuxt ships it: `@unhead/vue/client` patches the
 * DOM from a debounced `setTimeout(fn, 0)`, and Nuxt's head plugin also pauses
 * it between `page:start` and `page:finish`. Either way the patch lands in a
 * LATER task than Vue's render, and a browser may paint between two tasks.
 * Never flushing it here models the paused case and the debounced one alike:
 * whatever the test sees after `nextTick()` is what the frame after the text
 * commit would paint.
 */
function installDeferredHeadRenderer() {
  vi.spyOn(nuxtAppMocks, "useHead").mockImplementation((input: any) => {
    watch(
      input,
      (head: { htmlAttrs?: Record<string, string> }) => {
        setTimeout(() => {
          for (const [name, value] of Object.entries(head.htmlAttrs ?? {})) {
            document.documentElement.setAttribute(name, value);
          }
        }, 0);
      },
      { immediate: true },
    );
    return input;
  });
}

const catalog = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
  ar: { greeting: "مرحبا" },
};

let app: App | undefined;

/** The client plugin (no server payload) on `app`, its instance provided as `$i18n`. */
async function setupPlugin(target: App): Promise<VueI18n> {
  setComviOptions({ messages: catalog });
  const nuxtApp = Object.assign(nuxtAppMocks.useNuxtApp(), {
    vueApp: target,
    payload: {},
    hook: vi.fn(),
  });
  const plugin = (await import("../src/runtime/plugin")).default;
  const { provide } = (await plugin.setup(nuxtApp as never)) as { provide: { i18n: VueI18n } };
  setMockI18n(provide.i18n);
  return provide.i18n;
}

/** A page that calls `useLocaleHead()` and renders a key. */
async function mountPage() {
  const Page = defineComponent({
    setup() {
      useLocaleHead({ addAlternateLinks: false, addCanonical: false, addOgLocale: false });
      const { t } = useI18n();
      return () => h("p", { id: "text" }, t("greeting"));
    },
  });

  const host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp(Page);
  const i18n = await setupPlugin(app);
  app.mount(host);
  // Server-rendered state: the SSR head already wrote the attributes.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { i18n, text: () => host.querySelector("#text")!.textContent };
}

describe("useLocaleHead: <html lang/dir> follow the rendered text in the same commit", () => {
  beforeEach(() => {
    resetMocks();
    nuxtAppMocks.mockRuntimeConfig.public.comvi.locales = ["en", "uk", "ar"];
    setMockRoute({ path: "/", fullPath: "/" });
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
    installDeferredHeadRenderer();
    vi.useRealTimers();
  });

  afterEach(async () => {
    // Drain the deferred head writes this test scheduled, so none lands in the next.
    await new Promise((resolve) => setTimeout(resolve, 0));
    app?.unmount();
    app = undefined;
    document.body.innerHTML = "";
  });

  it("patches lang in the commit that switches the text on setLocale()", async () => {
    const { i18n, text } = await mountPage();
    expect(text()).toBe("Hello");
    expect(document.documentElement.lang).toBe("en");

    await i18n.setLocale("uk");
    // Vue's render flush; no task boundary, so no paint, since setLocale resolved.
    await nextTick();

    expect(text()).toBe("Привіт");
    expect(document.documentElement.lang).toBe("uk");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("patches dir=rtl in the same commit when switching to an rtl locale", async () => {
    const { i18n, text } = await mountPage();
    expect(document.documentElement.dir).toBe("ltr");

    await i18n.setLocale("ar");
    await nextTick();

    expect(text()).toBe("مرحبا");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("patches lang in the same commit on client navigation to a prefixed route", async () => {
    const { text } = await mountPage();
    const middleware = (await import("../src/runtime/middleware/i18n.global")).default as (
      to: unknown,
    ) => Promise<unknown>;

    await middleware({ path: "/uk/about", fullPath: "/uk/about", query: {} });
    await nextTick();

    expect(text()).toBe("Привіт");
    expect(document.documentElement.lang).toBe("uk");
  });

  it("leaves the attributes to the head renderer before any switch (hydration is untouched)", async () => {
    await mountPage();
    // Written by the (deferred) head renderer alone: no client write runs at
    // mount, so the server-rendered attributes are never patched on hydration.
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("adds no DOM write on the server, so the SSR head stays the head renderer's alone", async () => {
    vi.stubGlobal("__COMVI_TEST_SERVER__", true);
    vi.spyOn(nuxtAppMocks, "useHead").mockImplementation((input: any) => input);
    const i18n = createVueI18n({ locale: "en", messages: catalog, timeZone: "UTC" });
    const Page = defineComponent({
      setup() {
        useLocaleHead({ addAlternateLinks: false, addCanonical: false });
        return () => h("p");
      },
    });
    app = createApp(Page);
    app.use(i18n);
    app.mount(document.createElement("div"));

    await i18n.setLocale("ar");
    await nextTick();

    expect(document.documentElement.hasAttribute("lang")).toBe(false);
    expect(document.documentElement.hasAttribute("dir")).toBe(false);
  });

  it("leaves an attribute alone that a higher-priority head entry owns", async () => {
    // The app pinned `lang` itself (`useHead({ htmlAttrs: { lang } })` at a
    // higher priority), so the DOM holds that value, not the one this
    // composable produced. The head renderer keeps it; so must the same-commit write.
    const { i18n } = await mountPage();
    document.documentElement.setAttribute("lang", "x-app");

    await i18n.setLocale("ar");
    await nextTick();

    expect(document.documentElement.lang).toBe("x-app");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("does not write an attribute its option turned off", async () => {
    // The plugin's own `comvi.head` entry would write both; this case is about
    // the composable's options alone.
    nuxtAppMocks.mockRuntimeConfig.public.comvi.head = false;
    const Page = defineComponent({
      setup() {
        useLocaleHead({ addDir: false, addLang: false });
        return () => h("p");
      },
    });
    app = createApp(Page);
    const i18n = await setupPlugin(app);
    app.mount(document.createElement("div"));

    await i18n.setLocale("ar");
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.documentElement.hasAttribute("lang")).toBe(false);
    expect(document.documentElement.hasAttribute("dir")).toBe(false);
  });
});
