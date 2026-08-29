/**
 * Structural contract for `<T>` against the REAL `@comvi/core` pipeline, so tag
 * parsing, the per-call extension channel and missing-param semantics are
 * exercised end to end. Also pins that untrusted translation markup never
 * creates DOM elements.
 *
 * The fallback-parity fixture below is the same table as the react/solid/svelte
 * wrappers — source of truth packages/svelte/tests/T-structural.test.ts, keep
 * the four in sync.
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, defineComponent } from "vue";
import { createI18n } from "../src/createI18n";
import type { AnyVueI18n } from "../src/VueI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

export const WRAPPER_PARITY_FIXTURE = {
  translations: {
    plain: "Hello world",
    param: "Hello {name}!",
    tag: "Click <link>here</link> now",
    nested: "Read <outer>the <inner>fine</inner> print</outer>.",
    "missing-param": "Hi {name}",
  },
  cases: [
    { key: "plain", params: {}, components: {}, text: "Hello world" },
    { key: "param", params: { name: "Ada" }, components: {}, text: "Hello Ada!" },
    { key: "tag", params: {}, components: { link: "a" }, text: "Click here now" },
    {
      key: "nested",
      params: {},
      components: { outer: "strong", inner: "em" },
      text: "Read the fine print.",
    },
    // Core's default `missingParam: "literal"` renders the placeholder as-is.
    { key: "missing-param", params: {}, components: {}, text: "Hi {name}" },
  ],
} as const;

const makeI18n = (translations: Record<string, string>) =>
  createI18n({ locale: "en", translation: { en: translations } });

// `<T>` is multi-root, and @vue/test-utils trims each root fragment in text(),
// eating inter-node whitespace. A single-root host keeps textContent honest.
const mountT = (
  i18n: AnyVueI18n,
  props: Record<string, unknown>,
  slots?: Record<string, unknown>,
) =>
  mount(
    defineComponent({
      render: () => h("div", h(T, props as never, slots as never)),
    }),
    { global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } } },
  );

describe("<T /> structural render (wrapper parity)", () => {
  it("renders nested tags as real nested DOM elements", () => {
    const i18n = makeI18n({ nested: "Read <outer>the <inner>fine</inner> print</outer>." });

    const wrapper = mountT(i18n, {
      i18nKey: "nested",
      components: { outer: "strong", inner: "em" },
    });

    const strong = wrapper.find("strong");
    expect(strong.exists()).toBe(true);
    const em = strong.find("em");
    expect(em.exists()).toBe(true);
    expect(em.text()).toBe("fine");
    expect(wrapper.text()).toContain("Read the fine print.");
  });

  it("renders untrusted translation markup as text, never as elements", () => {
    const i18n = makeI18n({ evil: "hi <script>window.pwned = true</script> there" });

    const wrapper = mountT(i18n, { i18nKey: "evil" });

    // No handler for `<script>`, so the tag falls back to its inner text:
    // nothing in a translation string can create a DOM element.
    expect(wrapper.find("script").exists()).toBe(false);
    expect(Reflect.get(window, "pwned")).toBeUndefined();
    expect(wrapper.text()).toContain("hi ");
    expect(wrapper.text()).toContain(" there");
  });

  describe("default-slot fallback (children-fallback parity)", () => {
    it("renders the default slot as fallback for a missing key", () => {
      const i18n = makeI18n({});

      const wrapper = mountT(
        i18n,
        { i18nKey: "missing.key" },
        { default: () => h("span", { "data-testid": "fallback" }, "Slot fallback") },
      );

      expect(wrapper.find('[data-testid="fallback"]').exists()).toBe(true);
      expect(wrapper.text()).toContain("Slot fallback");
      expect(wrapper.text()).not.toContain("missing.key");
    });

    it("ignores the default slot when the translation exists", () => {
      const i18n = makeI18n({ hello: "Hello" });

      const wrapper = mountT(i18n, { i18nKey: "hello" }, { default: () => "Slot fallback" });

      expect(wrapper.text()).toBe("Hello");
    });

    it("prefers the fallback prop over the default slot", () => {
      const i18n = makeI18n({});

      const wrapper = mountT(
        i18n,
        { i18nKey: "missing.key", fallback: "Prop fallback" },
        { default: () => "Slot fallback" },
      );

      expect(wrapper.text()).toBe("Prop fallback");
    });

    it("renders the key when there is no fallback of any kind", () => {
      const i18n = makeI18n({});

      const wrapper = mountT(i18n, { i18nKey: "missing.key" });

      expect(wrapper.text()).toBe("missing.key");
    });
  });

  // The host is the BASE one, with no tag syntax of its own: these rows pass
  // only because `prepareTranslation` passes the tag extension per call. Every
  // row must produce byte-identical text to the react/svelte/solid wrappers.
  describe("fallback-parity fixture (shared with svelte/react)", () => {
    for (const parityCase of WRAPPER_PARITY_FIXTURE.cases) {
      it(`produces the shared text for "${parityCase.key}"`, () => {
        const i18n = makeI18n({ ...WRAPPER_PARITY_FIXTURE.translations });

        const wrapper = mountT(i18n, {
          i18nKey: parityCase.key,
          params: { ...parityCase.params },
          components: { ...parityCase.components },
        });

        expect(wrapper.text()).toBe(parityCase.text);
      });
    }
  });
});
