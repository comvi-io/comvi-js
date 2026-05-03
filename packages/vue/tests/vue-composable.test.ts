import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, defineComponent, ref } from "vue";
import { createI18n } from "../src";
import { useI18n } from "../src/composables/useI18n";

describe("useI18n composable", () => {
  it("throws when used without provider", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const C = {
      setup() {
        useI18n();
        return () => null;
      },
    };

    expect(() => mount(C)).toThrow(
      /useI18n must be used within a Vue app with i18n plugin installed/i,
    );

    warnSpy.mockRestore();
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

  it("returns plain text from t and structured content from tRaw", async () => {
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

    expect(wrapper.text()).toBe("Hello Alice!-true");
  });

  it("supports destructured imperative methods and event subscriptions", async () => {
    const onError = vi.fn();
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      onError,
    });
    i18n.addTranslations({
      en: { greeting: "Hello" },
      fr: { greeting: "Bonjour" },
    });
    await i18n.init();

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

    const wrapper = mount(C, { global: { plugins: [i18n] } });

    expect(wrapper.get('[data-testid="change-locale"]').text()).toBe("Hello");
    expect(wrapper.get('[data-testid="last-locale-change"]').text()).toBe("none");

    await wrapper.get('[data-testid="change-locale"]').trigger("click");

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="change-locale"]').text()).toBe("Bonjour");
      expect(wrapper.get('[data-testid="last-locale-change"]').text()).toBe("fr");
    });

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
