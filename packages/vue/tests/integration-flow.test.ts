import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createI18n, useI18n, T } from "../src";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";

describe("Integration Flow", () => {
  let mockLanguageDetector: ReturnType<typeof vi.fn>;
  let mockLoader: ReturnType<typeof vi.fn>;
  let loadedLanguages: Set<string>;

  beforeEach(() => {
    loadedLanguages = new Set();

    // Mock language detector
    mockLanguageDetector = vi.fn(() => "fr");

    // Mock loader
    mockLoader = vi.fn(async (locale: string, namespace: string) => {
      loadedLanguages.add(`${locale}:${namespace}`);

      const translations: Record<string, Record<string, string>> = {
        "en:common": {
          hello: "Hello",
          welcome: "Welcome {name}",
          items: "{count, plural, one {# item} other {# items}}",
        },
        "en:admin": {
          title: "Admin Panel",
        },
        "fr:common": {
          hello: "Bonjour",
          welcome: "Bienvenue {name}",
          items: "{count, plural, one {# élément} other {# éléments}}",
        },
        "fr:admin": {
          title: "Panneau d'administration",
        },
        "de:common": {
          hello: "Hallo",
          welcome: "Willkommen {name}",
        },
        "de:admin": {
          title: "Adminbereich",
        },
      };

      return translations[`${locale}:${namespace}`] || {};
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with detector/loader and updates components + namespaces", async () => {
    const i18n = createI18n({
      locale: "en",
      fallbackLocale: "en",
      defaultNs: "common",
    });

    i18n.use((i18n) => {
      i18n.registerLocaleDetector(() => mockLanguageDetector());
    });

    i18n.use((i18n) => {
      i18n.registerLoader(mockLoader);
    });

    await i18n.init();

    expect(mockLanguageDetector).toHaveBeenCalled();
    expect(i18n.locale.value).toBe("fr");
    expect(loadedLanguages.has("fr:common")).toBe(true);

    const TestComponent = defineComponent({
      setup() {
        const { t, locale } = useI18n();
        return () =>
          h("div", [
            h("span", { "data-testid": "greeting" }, t("hello")),
            h("span", { "data-testid": "lang" }, locale.value),
            h("span", { "data-testid": "welcome" }, [
              h(T, { i18nKey: "welcome", params: { name: "Marie" } }),
            ]),
          ]);
      },
    });

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('[data-testid="greeting"]').text()).toBe("Bonjour");
    expect(wrapper.find('[data-testid="lang"]').text()).toBe("fr");
    expect(wrapper.find('[data-testid="welcome"]').text()).toBe("Bienvenue Marie");

    await i18n.setLocale("de");
    await nextTick();

    expect(wrapper.find('[data-testid="greeting"]').text()).toBe("Hallo");
    expect(wrapper.find('[data-testid="lang"]').text()).toBe("de");
    expect(wrapper.find('[data-testid="welcome"]').text()).toBe("Willkommen Marie");

    await i18n.addActiveNamespace("admin");
    expect(i18n.t("title", { ns: "admin" })).toBe("Adminbereich");
  });

  it("handles rapid locale switches without ending in stale state", async () => {
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
    });

    i18n.use((i18n) => {
      i18n.registerLoader(mockLoader);
    });

    await i18n.init();

    const finalLocale = "de";
    const localeChanged = new Promise<void>((resolve) => {
      const unsubscribe = i18n.on("localeChanged", ({ to }) => {
        if (to === finalLocale) {
          unsubscribe();
          resolve();
        }
      });
    });

    i18n.locale = "fr";
    i18n.locale = "en";
    i18n.locale = finalLocale;

    await localeChanged;

    expect(i18n.locale.value).toBe(finalLocale);
    const expectedHello: Record<string, string> = {
      en: "Hello",
      fr: "Bonjour",
      de: "Hallo",
    };
    expect(i18n.t("hello")).toBe(expectedHello[finalLocale]);
  });
});
