import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, provide, type PropType } from "vue";
import { icuCompiler, useI18n } from "../src";
import { createI18n } from "../src/createI18n";
import type { VueI18n } from "../src/VueI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

declare module "@comvi/core" {
  interface TranslationKeys {
    review: never;
  }
}

const REVIEW_SELECT: Record<string, Record<string, string>> = {
  en: { review: "Your review" },
  de: { review: "{formality, select, formal {Ihre Bewertung} other {Deine Bewertung}}" },
  fr: { review: "{formality, select, formal {Votre avis} other {Ton avis}}" },
};

function createInstance(locale: string, formality?: string) {
  // The catalog is ICU `select`, so the constructor names the compiler that
  // understands it — the base host's simple compiler does not.
  return createI18n({
    locale,
    compiler: icuCompiler,
    translation: REVIEW_SELECT,
    ...(formality ? { defaultParams: { formality } } : {}),
  });
}

const ReviewText = defineComponent({
  setup() {
    const { t } = useI18n();
    return () => h("span", t("review"));
  },
});

const InstanceScope = defineComponent({
  props: { instance: { type: Object as PropType<VueI18n>, required: true } },
  setup(props, { slots }) {
    provide(I18N_INJECTION_KEY, props.instance);
    return () => h("section", slots.default?.());
  },
});

describe("Subtree instance shadowing via I18N_INJECTION_KEY", () => {
  it("resolves the nearest provided instance for useI18n and <T>, app instance elsewhere", () => {
    const appI18n = createInstance("en");
    const dePreview = createInstance("de", "formal");
    const frPreview = createInstance("fr");

    const App = defineComponent({
      setup() {
        return () =>
          h("div", [
            h(ReviewText, { class: "app" }),
            h(InstanceScope, { instance: dePreview, class: "de" }, () => [
              h(ReviewText),
              h(T, { i18nKey: "review" }),
            ]),
            h(InstanceScope, { instance: frPreview, class: "fr" }, () => h(ReviewText)),
          ]);
      },
    });

    const wrapper = mount(App, {
      global: { provide: { [I18N_INJECTION_KEY as symbol]: appI18n } },
    });

    const deScope = wrapper.get("section.de");
    expect(wrapper.get("span.app").text()).toBe("Your review");
    expect(deScope.get("span").text()).toBe("Ihre Bewertung");
    expect(deScope.text()).toBe("Ihre BewertungIhre Bewertung");
    expect(wrapper.get("section.fr").text()).toBe("Ton avis");
  });

  it("call-level params still override the subtree instance defaults", () => {
    const dePreview = createInstance("de", "formal");

    const Inside = defineComponent({
      setup() {
        const { t } = useI18n();
        return () => h("span", t("review", { formality: "informal" }));
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(InstanceScope, { instance: dePreview }, () => h(Inside));
        },
      }),
      { global: { provide: { [I18N_INJECTION_KEY as symbol]: createInstance("en") } } },
    );

    expect(wrapper.text()).toBe("Deine Bewertung");
  });
});
