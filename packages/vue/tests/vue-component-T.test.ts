import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import { type TranslationResult, type FragmentNode } from "../src";
import { VueI18n } from "../src/VueI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

// Type declarations for test translation keys
declare module "@comvi/core" {
  interface TranslationKeys {
    hello: never;
    w: { n: string };
    "missing.key": never;
    greeting: never;
    title: never;
    fragment: never;
    multiRoot: never;
    emptySlot: never;
  }
}

describe("<T /> component", () => {
  it("renders simple translation", () => {
    const i18n = new VueI18n({ locale: "en", translation: { en: { hello: "Hello" } } });
    const wrapper = mount(T, {
      props: { i18nKey: "hello" },
      global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
    });
    expect(wrapper.text()).toBe("Hello");
  });

  it("throws when used without provider", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => mount(T, { props: { i18nKey: "hello" } })).toThrow(
      /<T> component must be used within a Vue app with i18n plugin installed/i,
    );
    warnSpy.mockRestore();
  });

  it("renders with params", () => {
    const i18n = new VueI18n({ locale: "en", translation: { en: { w: "Welcome {n}" } } });
    const wrapper = mount(T, {
      props: { i18nKey: "w", params: { n: "John" } },
      global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
    });
    expect(wrapper.text()).toBe("Welcome John");
  });

  it("uses namespace override when provided", () => {
    const i18n = new VueI18n({
      language: "en",
      translation: { "en:dashboard": { title: "Dashboard" } },
    });
    const wrapper = mount(T, {
      props: { i18nKey: "title", ns: "dashboard" },
      global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
    });
    expect(wrapper.text()).toBe("Dashboard");
  });

  it("renders fragment nodes from tag handlers", () => {
    const i18n = new VueI18n({
      language: "en",
      translation: { en: { fragment: "Hello <wrap>world</wrap>" } },
    });

    const wrapper = mount(T, {
      props: {
        i18nKey: "fragment",
        params: {
          wrap: ({ children }: { children: TranslationResult }) => {
            const fragmentChildren = typeof children === "string" ? [children] : children;
            return { type: "fragment", children: fragmentChildren } as FragmentNode;
          },
        },
      },
      global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
    });

    expect(wrapper.text()).toMatch(/Hello\s*world/);
    expect(wrapper.find("template").exists()).toBe(false);
  });

  it("renders multi-root slot content", () => {
    const i18n = new VueI18n({
      language: "en",
      translation: { en: { multiRoot: "Click <link>here</link>" } },
    });

    const wrapper = mount(T, {
      props: { i18nKey: "multiRoot" },
      slots: {
        link: ({ children }: { children: unknown }) => [
          h("strong", {}, children as any),
          h("em", {}, "!"),
        ],
      },
      global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
    });

    expect(wrapper.find("strong").exists()).toBe(true);
    expect(wrapper.find("strong").text()).toBe("here");
    expect(wrapper.find("em").exists()).toBe(true);
    expect(wrapper.find("em").text()).toBe("!");
    expect(wrapper.text()).toMatch(/Click\s*here!/);
  });

  it("handles empty slot content", () => {
    const i18n = new VueI18n({
      language: "en",
      translation: { en: { emptySlot: "Start <link></link> end" } },
    });

    const wrapper = mount(T, {
      props: { i18nKey: "emptySlot" },
      slots: {
        link: () => [],
      },
      global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
    });

    expect(wrapper.text()).toMatch(/Start\s*end/);
  });

  describe("fallback prop", () => {
    it("uses fallback with interpolation when translation is missing", () => {
      const i18n = new VueI18n({
        language: "en",
        translation: { en: { hello: "Hello" } },
      });
      const wrapper = mount(T, {
        props: {
          i18nKey: "missing.key",
          fallback: "Hello {name}",
          params: { name: "Alice" },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });
      expect(wrapper.text()).toBe("Hello Alice");
    });

    it("ignores fallback when translation exists", () => {
      const i18n = new VueI18n({
        language: "en",
        translation: { en: { hello: "Hello" } },
      });
      const wrapper = mount(T, {
        props: { i18nKey: "hello", fallback: "Fallback text" },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });
      expect(wrapper.text()).toBe("Hello");
    });
  });

  describe("raw prop", () => {
    it("skips post-processor when raw is true", () => {
      const i18n = new VueI18n({
        language: "en",
        translation: { en: { greeting: "hello" } },
      });

      // Post-processor that uppercases text
      i18n.registerPostProcessor((result, key, ns, params) => {
        if (params?.raw === true) {
          return result;
        }
        return typeof result === "string" ? result.toUpperCase() : result;
      });

      const wrapper = mount(T, {
        props: { i18nKey: "greeting", raw: true },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // Should be lowercase because post-processor was skipped
      expect(wrapper.text()).toBe("hello");
    });

    it("applies post-processor when raw is false", () => {
      const i18n = new VueI18n({
        language: "en",
        translation: { en: { greeting: "hello" } },
      });

      i18n.registerPostProcessor((result, key, ns, params) => {
        if (params?.raw === true) {
          return result;
        }
        return typeof result === "string" ? result.toUpperCase() : result;
      });

      const wrapper = mount(T, {
        props: { i18nKey: "greeting", raw: false },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // Should be uppercase because post-processor was applied
      expect(wrapper.text()).toBe("HELLO");
    });

    it("applies post-processor when raw is not specified", () => {
      const i18n = new VueI18n({
        language: "en",
        translation: { en: { greeting: "hello" } },
      });

      i18n.registerPostProcessor((result, key, ns, params) => {
        if (params?.raw === true) {
          return result;
        }
        return typeof result === "string" ? result.toUpperCase() : result;
      });

      const wrapper = mount(T, {
        props: { i18nKey: "greeting" },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // Should be uppercase because raw is not set
      expect(wrapper.text()).toBe("HELLO");
    });

    it("works with other props combined", () => {
      const i18n = new VueI18n({
        language: "en",
        translation: { en: { greeting: "hello {name}" } },
      });

      i18n.registerPostProcessor((result, key, ns, params) => {
        if (params?.raw === true) {
          return result;
        }
        return typeof result === "string" ? result.toUpperCase() : result;
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "greeting",
          params: { name: "World" },
          raw: true,
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // Should be lowercase with interpolation applied
      expect(wrapper.text()).toBe("hello World");
    });
  });
});
