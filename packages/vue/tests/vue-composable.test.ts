import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, defineComponent, ref } from "vue";
import { createI18n, icuCompiler } from "../src";
import { useI18n } from "../src/composables/useI18n";

describe("useI18n composable", () => {
  it("throws when used without provider", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const C = {
      setup() {
        useI18n();
        return () => null;
      },
    };

    expect(() => mount(C)).toThrow(
      /useI18n must be used within a Vue app with i18n plugin installed/i,
    );
  });

  it("provides reactive locale and translates through installed plugin", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" });
    i18n.addTranslations({
      en: { k: "v" },
      fr: { k: "valeur" },
    });
    await i18n.init();

    const C = {
      template: '<div>{{ t("k") }}-{{ locale }}</div>',
      setup() {
        const { t, locale } = useI18n();
        return { t, locale };
      },
    };

    const wrapper = mount(C, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toBe("v-en");

    await i18n.setLocale("fr");
    await nextTick();

    expect(wrapper.text()).toBe("valeur-fr");
  });

  it("re-renders formatter output when locale changes", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" });
    i18n.addTranslations({
      en: { k: "v" },
      de: { k: "w" },
    });
    await i18n.init();

    const C = {
      template: "<div>{{ formatNumber(1234.5) }}</div>",
      setup() {
        const { formatNumber } = useI18n();
        return { formatNumber };
      },
    };

    const wrapper = mount(C, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toBe("1,234.5");

    await i18n.setLocale("de");
    await nextTick();

    expect(wrapper.text()).toBe("1.234,5");
  });

  it("binds the requested namespace for translations", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" });
    i18n.addTranslations({
      "en:common": { key: "Common" },
      "en:admin": { key: "Admin" },
    });
    await i18n.init();

    const C = {
      template: '<div>{{ t("key") }}</div>',
      setup() {
        const { t } = useI18n("admin");
        return { t };
      },
    };

    const wrapper = mount(C, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toBe("Admin");
  });

  it("exposes reactive defaultParams and setDefaultParams through the composable", async () => {
    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      defaultParams: { formality: "formal" as const },
      translation: {
        en: {
          review: "{formality, select, formal {Formal} other {Informal}}",
        },
      },
    });

    const C = {
      template: '<div>{{ t("review") }}-{{ defaultParams?.formality }}</div>',
      setup() {
        return useI18n<{ formality: "formal" | "informal" }>();
      },
    };

    const wrapper = mount(C, { global: { plugins: [i18n] } });
    expect(wrapper.text()).toBe("Formal-formal");

    wrapper.vm.setDefaultParams({ formality: "informal" });
    await nextTick();

    expect(wrapper.text()).toBe("Informal-informal");
  });

  it("returns plain text from t and leaves string-API tag markup literal", async () => {
    // `basicHtmlTags` configures how tag TOKENS render, but the base host
    // never claims `<` as syntax, so plain `t()` / `tRaw()` see one literal
    // string. Rich text comes from `<T>` or an explicit `@comvi/core/tags`
    // import — never as a side effect of `useI18n`.
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      tagInterpolation: { basicHtmlTags: ["strong"] },
    });
    i18n.addTranslations({
      en: { rich: "Hello <strong>Alice</strong>!" },
    });
    await i18n.init();

    const C = {
      template: "<div>{{ text }}-{{ isRawStructured }}</div>",
      setup() {
        const { t, tRaw } = useI18n();
        return {
          text: t("rich"),
          isRawStructured: Array.isArray(tRaw("rich")),
        };
      },
    };

    const wrapper = mount(C, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toBe("Hello <strong>Alice</strong>!-false");
  });

  const mountDestructuredHarness = (onError: (...args: never[]) => void) => {
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      onError: onError as never,
    });
    i18n.addTranslations({
      en: { greeting: "Hello" },
      fr: { greeting: "Bonjour" },
    });

    const C = defineComponent({
      setup() {
        const lastLocaleChange = ref("none");
        const { t, setLocale, on, reportError } = useI18n();
        on("localeChanged", ({ to }) => {
          lastLocaleChange.value = to;
        });
        const triggerReport = () => {
          reportError(new Error("boom"), { source: "translation" });
        };
        return { t, setLocale, triggerReport, lastLocaleChange };
      },
      template: `
        <div>
          <button data-testid="change-locale" @click="setLocale('fr')">{{ t("greeting") }}</button>
          <button data-testid="report-error" @click="triggerReport">report</button>
          <span data-testid="last-locale-change">{{ lastLocaleChange }}</span>
        </div>
      `,
    });

    return { i18n, mount: () => mount(C, { global: { plugins: [i18n] } }) };
  };

  it("supports destructured imperative methods and event subscriptions", async () => {
    const harness = mountDestructuredHarness(vi.fn());
    await harness.i18n.init();

    const wrapper = harness.mount();

    expect(wrapper.get('[data-testid="change-locale"]').text()).toBe("Hello");
    expect(wrapper.get('[data-testid="last-locale-change"]').text()).toBe("none");

    await wrapper.get('[data-testid="change-locale"]').trigger("click");

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="change-locale"]').text()).toBe("Bonjour");
      expect(wrapper.get('[data-testid="last-locale-change"]').text()).toBe("fr");
    });
  });

  it("routes a destructured reportError call to the configured onError handler", async () => {
    const onError = vi.fn();
    const harness = mountDestructuredHarness(onError);
    await harness.i18n.init();

    const wrapper = harness.mount();

    await wrapper.get('[data-testid="report-error"]').trigger("click");

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }), {
      source: "translation",
    });
  });

  it("does not receive reactive updates after component unmount", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" });
    i18n.addTranslations({
      en: { greeting: "Hello" },
      fr: { greeting: "Bonjour" },
    });
    await i18n.init();

    let renderCount = 0;
    const RenderTracker = defineComponent({
      setup() {
        const { t, locale } = useI18n();
        return () => {
          renderCount += 1;
          return `${t("greeting")}-${locale.value}`;
        };
      },
    });

    const wrapper = mount(RenderTracker, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toBe("Hello-en");
    const rendersBeforeUnmount = renderCount;

    wrapper.unmount();

    await i18n.setLocale("fr");
    await nextTick();

    expect(renderCount).toBe(rendersBeforeUnmount);
  });
});
