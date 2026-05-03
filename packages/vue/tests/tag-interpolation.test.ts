import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, defineComponent, markRaw } from "vue";
import { VueI18n } from "../src/VueI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

// Type declarations for test translation keys
declare module "@comvi/core" {
  interface TranslationKeys {
    "tagged.simple": never;
    "tagged.multiple": never;
    "tagged.nested": never;
    "tagged.self-closing": never;
    "tagged.with-params": { name: string };
    "tagged.html": never;
  }
}

describe("<T /> component - Tag Interpolation", () => {
  const createI18n = (translations: Record<string, string>, options?: any) => {
    return new VueI18n({
      locale: "en",
      translation: { en: translations },
      ...options,
    });
  };

  describe("Slots as Tag Handlers", () => {
    it("should render tag content with slot handler", () => {
      const i18n = createI18n({
        msg: "Click <link>here</link> for help",
      });

      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        slots: {
          link: ({ children }: { children: any }) => h("a", { href: "#" }, children),
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("a").exists()).toBe(true);
      expect(wrapper.find("a").text()).toBe("here");
      expect(wrapper.text()).toContain("Click");
      expect(wrapper.text()).toContain("for help");
    });

    it("should handle nested tags with slots", () => {
      const i18n = createI18n({
        msg: "Click <link><bold>here</bold></link>",
      });

      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        slots: {
          link: ({ children }: { children: any }) => h("a", { href: "#" }, children),
          bold: ({ children }: { children: any }) => h("strong", {}, children),
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("a").exists()).toBe(true);
      expect(wrapper.find("a strong").exists()).toBe(true);
      expect(wrapper.find("a strong").text()).toBe("here");
    });
  });

  describe("Components Prop", () => {
    it("should render tag with string component name", () => {
      const i18n = createI18n({
        msg: "This is <bold>important</bold>",
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: {
            bold: "strong",
          },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("strong").exists()).toBe(true);
      expect(wrapper.find("strong").text()).toBe("important");
    });

    it("should render tag with component object", () => {
      const i18n = createI18n({
        msg: "Click <link>here</link>",
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: {
            link: {
              component: "a",
              props: { href: "/help", class: "text-blue" },
            },
          },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      const link = wrapper.find("a");
      expect(link.exists()).toBe(true);
      expect(link.attributes("href")).toBe("/help");
      expect(link.attributes("class")).toBe("text-blue");
      expect(link.text()).toBe("here");
    });

    it("should render tag with Vue component", () => {
      const i18n = createI18n({
        msg: "Click <btn>Submit</btn>",
      });

      // markRaw prevents Vue from making the component reactive
      // (avoids performance overhead warning)
      const MyButton = markRaw(
        defineComponent({
          name: "MyButton",
          template: '<button class="custom-btn"><slot /></button>',
        }),
      );

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: {
            btn: MyButton,
          },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("button.custom-btn").exists()).toBe(true);
      expect(wrapper.find("button.custom-btn").text()).toBe("Submit");
    });

    it("should prioritize components prop over slots", () => {
      const i18n = createI18n({
        msg: "<tag>content</tag>",
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: {
            tag: "span",
          },
        },
        slots: {
          tag: ({ children }: { children: any }) => h("div", {}, children),
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // Components prop should win
      expect(wrapper.find("span").exists()).toBe(true);
      expect(wrapper.find("div").exists()).toBe(false);
    });

    it("should allow handlers named like optional transport params when prop is unset", () => {
      const i18n = createI18n({
        msg: "Hello <raw>world</raw> and <fallback>friends</fallback>",
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: {
            raw: "strong",
            fallback: "em",
          },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("strong").exists()).toBe(true);
      expect(wrapper.find("strong").text()).toBe("world");
      expect(wrapper.find("em").exists()).toBe(true);
      expect(wrapper.find("em").text()).toBe("friends");
    });
  });

  describe("Basic HTML Tags Whitelist", () => {
    it("should render whitelisted HTML tags without handler", () => {
      const i18n = new VueI18n({
        locale: "en",
        translation: { en: { msg: "This is <strong>bold</strong> text" } },
        tagInterpolation: {
          basicHtmlTags: ["strong", "em", "br"],
        },
      });

      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("strong").exists()).toBe(true);
      expect(wrapper.find("strong").text()).toBe("bold");
    });

    it("should render self-closing whitelisted tags", () => {
      const i18n = new VueI18n({
        locale: "en",
        translation: { en: { msg: "Line 1<br/>Line 2" } },
        tagInterpolation: {
          basicHtmlTags: ["br"],
        },
      });

      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("br").exists()).toBe(true);
    });

    it("should prioritize explicit handler over whitelist", () => {
      const i18n = new VueI18n({
        locale: "en",
        translation: { en: { msg: "<strong>text</strong>" } },
        tagInterpolation: {
          basicHtmlTags: ["strong"],
        },
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: { strong: "b" },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // Should use <b> from components, not <strong> from whitelist
      expect(wrapper.find("b").exists()).toBe(true);
      expect(wrapper.find("strong").exists()).toBe(false);
    });
  });

  describe("Fallback Behavior", () => {
    it("should fall back to inner text when no handler provided", () => {
      const i18n = createI18n({
        msg: "Click <link>here</link> for help",
      });

      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // No slot or components for "link", should show inner text
      expect(wrapper.text()).toBe("Click here for help");
      expect(wrapper.find("a").exists()).toBe(false);
    });

    it("should throw in strict mode when handler is missing", () => {
      const i18n = createI18n(
        {
          msg: "Click <link>here</link> for help",
        },
        {
          tagInterpolation: { strict: true },
        },
      );

      expect(() =>
        mount(T, {
          props: { i18nKey: "msg" },
          global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
        }),
      ).toThrow(/Missing handler for tag|E_MISSING_TAG_HANDLER/i);
    });

    it("should fall back to inner text in strict=warn mode", () => {
      const i18n = createI18n(
        {
          msg: "Click <link>here</link> for help",
        },
        {
          tagInterpolation: { strict: "warn" },
        },
      );

      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.text()).toBe("Click here for help");
    });
  });

  describe("Integration with ICU Parameters", () => {
    it("should handle tags with pluralization", () => {
      const i18n = createI18n({
        msg: "You have <bold>{count, plural, one {# item} other {# items}}</bold>",
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          params: { count: 5 },
          components: { bold: "strong" },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("strong").text()).toBe("5 items");
    });
  });

  describe("Self-Closing Tags", () => {
    it("should render self-closing tag with handler", () => {
      const i18n = createI18n({
        msg: "Rating: <star/><star/><star/>",
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: { star: { component: "span", props: { class: "star" } } },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.findAll("span.star")).toHaveLength(3);
    });
  });

  describe("Reactivity", () => {
    it("should update when locale changes", async () => {
      const i18n = new VueI18n({
        locale: "en",
        translation: {
          en: { msg: "<bold>Hello</bold>" },
          fr: { msg: "<bold>Bonjour</bold>" },
        },
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: { bold: "strong" },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("strong").text()).toBe("Hello");

      await i18n.setLocale("fr");
      await wrapper.vm.$nextTick();

      expect(wrapper.find("strong").text()).toBe("Bonjour");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty tag content", () => {
      const i18n = createI18n({
        msg: "Empty: <tag></tag>",
      });

      const wrapper = mount(T, {
        props: {
          i18nKey: "msg",
          components: { tag: "span" },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      expect(wrapper.find("span").exists()).toBe(true);
      expect(wrapper.find("span").text()).toBe("");
    });
  });

  describe("Template slot children rendering", () => {
    it("should pass simple string children directly, not as array", () => {
      const i18n = createI18n({
        msg: "Please <link>click here</link> for more info",
      });

      let receivedChildren: unknown;
      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        slots: {
          link: ({ children }: { children: unknown }) => {
            receivedChildren = children;
            return h("a", { href: "#" }, children);
          },
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // children should be "click here" (string), not ["click here"] (array)
      expect(receivedChildren).toBe("click here");
      expect(wrapper.find("a").text()).toBe("click here");
    });

    it("should pass array children when there are multiple nodes", () => {
      const i18n = createI18n({
        msg: "<wrapper>Hello <bold>world</bold>!</wrapper>",
      });

      let receivedChildren: unknown;
      const wrapper = mount(T, {
        props: { i18nKey: "msg" },
        slots: {
          wrapper: ({ children }: { children: unknown }) => {
            receivedChildren = children;
            return h("div", {}, children);
          },
          bold: ({ children }: { children: unknown }) => h("strong", {}, children),
        },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });

      // children should be array when mixed content
      expect(Array.isArray(receivedChildren)).toBe(true);
      expect(wrapper.text()).toBe("Hello world!");
    });
  });
});
