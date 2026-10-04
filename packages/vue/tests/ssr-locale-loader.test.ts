/**
 * `ssrLocale` on a core that has `@comvi/core/loader` composed, an active
 * default namespace and both catalogs cached — the `createI18nFromCore` path,
 * where the core is built (and here initialized) before the wrapper. The
 * loader's `setLocale` awaits the namespace before `locale` moves, even on a
 * cache hit, so the wrapper's synchronous write may not have landed by the
 * first render. The first render, server string and client mount alike, must
 * still be in `ssrLocale`.
 */
import { describe, it, expect } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { mount } from "@vue/test-utils";
import { createI18n as createCore } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { createI18nFromCore, useI18n } from "../src";

const catalogs = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
};

/** The loaded core; the wrapper is built right before the render, with no await between. */
const loadedCore = async () => {
  const core = createCore({ locale: "en", exposeGlobal: false }).use(
    loader({
      en: async () => catalogs.en,
      uk: async () => catalogs.uk,
    }),
  );
  await core.init();
  await core.reloadMessages("uk");
  expect(core.locale).toBe("en");
  expect(core.hasLocale("uk")).toBe(true);
  return core;
};

const Greeting = defineComponent({
  setup() {
    const { t, locale } = useI18n();
    return () => h("span", { "data-locale": locale.value }, t("greeting"));
  },
});

describe("vue — ssrLocale with the loader composed", () => {
  it("renders the server string in the ssrLocale on the first render", async () => {
    const core = await loadedCore();
    const app = createSSRApp(Greeting).use(createI18nFromCore(core, { ssrLocale: "uk" }));

    const html = await renderToString(app);

    expect(html).toContain('data-locale="uk"');
    expect(html).toContain("Привіт");
  });

  it("paints the ssrLocale on the first client render", async () => {
    const core = await loadedCore();
    const wrapper = mount(Greeting, {
      global: { plugins: [createI18nFromCore(core, { ssrLocale: "uk" })] },
    });

    expect(wrapper.attributes("data-locale")).toBe("uk");
    expect(wrapper.text()).toBe("Привіт");
  });
});
