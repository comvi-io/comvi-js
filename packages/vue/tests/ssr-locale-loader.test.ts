/**
 * `ssrLocale` on a core with `@comvi/core/loader` composed — the
 * `createI18nFromCore` path, where the core is built and initialized before
 * the wrapper.
 *
 * The wrapper writes `ssrLocale` to the core and every reader (`t()`, `<T>`,
 * the `locale` ref, the formatters) mirrors the core. So the first render is
 * in `ssrLocale` exactly when the core can adopt it at once, which is when
 * that locale's catalogs are already loaded; otherwise the first render is in
 * the core's current locale and nothing runs ahead of it.
 */
import { describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { mount } from "@vue/test-utils";
import { createI18n as createCore } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { createI18nFromCore, T, useI18n } from "../src";

const catalogs = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
};
const number = (locale: string) => new Intl.NumberFormat(locale).format(1234.5);

/** `init()`ed at `en` with the loader composed; `uk` is whatever the test passes. */
const coreAtEn = async (uk: () => Promise<Record<string, string>>) => {
  const core = createCore({ locale: "en", exposeGlobal: false, onError: () => {} }).use(
    loader({ en: async () => catalogs.en, uk }),
  );
  await core.init();
  expect(core.locale).toBe("en");
  return core;
};

const coreWithBothCached = async () => {
  const core = await coreAtEn(async () => catalogs.uk);
  await core.reloadMessages("uk");
  expect(core.locale).toBe("en");
  expect(core.hasLocale("uk")).toBe(true);
  return core;
};

const View = defineComponent({
  setup() {
    const { t, locale, formatNumber } = useI18n();
    return () =>
      h("p", { "data-locale": locale.value }, [
        h("span", { "data-part": "t" }, t("greeting" as never)),
        h("span", { "data-part": "T" }, [h(T, { i18nKey: "greeting" as never })]),
        h("span", { "data-part": "number" }, formatNumber(1234.5)),
      ]);
  },
});

type Core = Awaited<ReturnType<typeof coreAtEn>>;

/** The wrapper is built right before the mount, with no await between. */
const mountWith = (core: Core) => {
  const wrapper = mount(View, {
    global: { plugins: [createI18nFromCore(core, { ssrLocale: "uk" })] },
  });
  return {
    read: () => ({
      locale: wrapper.attributes("data-locale"),
      t: wrapper.find('[data-part="t"]').text(),
      T: wrapper.find('[data-part="T"]').text(),
      number: wrapper.find('[data-part="number"]').text(),
    }),
  };
};

const allIn = (locale: "en" | "uk") => ({
  locale,
  t: catalogs[locale].greeting,
  T: catalogs[locale].greeting,
  number: number(locale),
});

describe("vue — ssrLocale with the loader composed", () => {
  describe("both catalogs already loaded", () => {
    it("renders the server string in ssrLocale: t(), <T>, the locale ref and the formatter", async () => {
      const core = await coreWithBothCached();
      const app = createSSRApp(View).use(createI18nFromCore(core, { ssrLocale: "uk" }));

      const html = await renderToString(app);

      expect(html).toContain('data-locale="uk"');
      expect(html.match(/Привіт/g)).toHaveLength(2);
      expect(html).not.toContain("Hello");
      expect(html).toContain(number("uk"));
    });

    it("paints ssrLocale on the first client render", async () => {
      const core = await coreWithBothCached();

      const view = mountWith(core);

      expect(core.locale).toBe("uk");
      expect(view.read()).toEqual(allIn("uk"));
    });
  });

  describe("the ssrLocale catalog is not loaded", () => {
    it("stays on the core's locale on the first render, then switches when the load completes", async () => {
      let deliver!: (catalog: Record<string, string>) => void;
      const core = await coreAtEn(() => new Promise((resolve) => (deliver = resolve)));

      const view = mountWith(core);
      expect(core.locale).toBe("en");
      expect(view.read()).toEqual(allIn("en"));

      deliver(catalogs.uk);
      await expect.poll(() => core.locale).toBe("uk");
      await nextTick();

      expect(view.read()).toEqual(allIn("uk"));
    });

    it("agrees with the core after the load fails", async () => {
      const core = await coreAtEn(async () => {
        throw new Error("offline");
      });
      const failed = new Promise<void>((resolve) =>
        core.on("loadError", ({ namespace }) => {
          if (namespace === "locale-change") resolve();
        }),
      );

      const view = mountWith(core);
      expect(view.read()).toEqual(allIn("en"));
      await failed;
      await nextTick();

      expect(core.locale).toBe("en");
      expect(view.read()).toEqual(allIn("en"));
      // The paint survives a reactive update.
      core.addMessages({ en: { unrelated: "x" } });
      await nextTick();
      expect(view.read()).toEqual(allIn("en"));
    });

    it("agrees with the core after a superseding setLocale('en')", async () => {
      let deliver!: (catalog: Record<string, string>) => void;
      const core = await coreAtEn(() => new Promise((resolve) => (deliver = resolve)));
      const view = mountWith(core);

      await core.setLocale("en");
      deliver(catalogs.uk);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await nextTick();

      expect(core.locale).toBe("en");
      expect(view.read()).toEqual(allIn("en"));
    });

    it("is superseded by the wrapper's own setLocale('en')", async () => {
      let deliver!: (catalog: Record<string, string>) => void;
      const core = await coreAtEn(() => new Promise((resolve) => (deliver = resolve)));
      const i18n = createI18nFromCore(core, { ssrLocale: "uk" });
      const wrapper = mount(View, { global: { plugins: [i18n] } });

      await i18n.setLocale("en");
      deliver(catalogs.uk);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await nextTick();

      expect(core.locale).toBe("en");
      expect(i18n.locale.value).toBe("en");
      expect(wrapper.find('[data-part="t"]').text()).toBe("Hello");
    });

    it("is superseded by assigning the locale ref", async () => {
      let deliver!: (catalog: Record<string, string>) => void;
      const core = await coreAtEn(() => new Promise((resolve) => (deliver = resolve)));
      const i18n = createI18nFromCore(core, { ssrLocale: "uk" });

      i18n.locale.value = "en";
      await new Promise((resolve) => setTimeout(resolve, 0));
      deliver(catalogs.uk);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(core.locale).toBe("en");
      expect(i18n.locale.value).toBe("en");
    });

    it("lets the ref ask for ssrLocale again after the core superseded it", async () => {
      // A detector plugin calling `core.setLocale("en")` over the pending
      // switch cancels it without any event the wrapper could hear.
      let deliver!: (catalog: Record<string, string>) => void;
      const core = await coreAtEn(() => new Promise((resolve) => (deliver = resolve)));
      const i18n = createI18nFromCore(core, { ssrLocale: "uk" });
      await core.setLocale("en");
      expect(core.locale).toBe("en");

      i18n.locale.value = "uk";
      await new Promise((resolve) => setTimeout(resolve, 0));
      deliver(catalogs.uk);

      await vi.waitFor(() => expect(core.locale).toBe("uk"));
      expect(i18n.locale.value).toBe("uk");
    });
  });
});
