/**
 * Structural contract for the prepareTranslation-backed <T> (§4.3):
 *   - the fallback-parity fixture pins the same template + params table as
 *     packages/svelte/tests/T-structural.test.ts (WRAPPER_PARITY_FIXTURE —
 *     keep the tables in sync across wrappers);
 *   - the default slot acts as missing-translation fallback (parity with the
 *     react/solid/svelte children fallback);
 *   - untrusted translation markup never creates DOM elements.
 *
 * Runs against the REAL @comvi/core pipeline (VueI18n wraps core I18n) so tag
 * parsing, the per-call extension channel, and missing-param semantics are
 * exercised end to end.
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, defineComponent } from "vue";
import { VueI18n } from "../src/VueI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

// ---------------------------------------------------------------------------
// Shared fallback-parity fixture (same table as the svelte/react wrappers)
// ---------------------------------------------------------------------------

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
    // missingParam: "literal" (core 0.5 default) — placeholder renders as itself
    { key: "missing-param", params: {}, components: {}, text: "Hi {name}" },
  ],
} as const;

const makeI18n = (translations: Record<string, string>) =>
  new VueI18n({ locale: "en", translation: { en: translations } });

// <T> is multi-root; @vue/test-utils trims each root fragment in text(),
// eating inter-node whitespace. A single-root host keeps textContent honest.
const mountT = (
  i18n: VueI18n,
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

    // No handler for <script> → the tag falls back to its inner text; nothing
    // in a translation string can create DOM elements.
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

      const wrapper = mountT(
        i18n,
        { i18nKey: "hello" },
        { default: () => "Slot fallback" },
      );

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
