/**
 * Structural-render contract for the rewritten T.svelte (§4.2):
 *   - the component renders the VirtualNode tree as real DOM nodes; there is
 *     no HTML-string sink ({@html}) anywhere in the component source;
 *   - Svelte component handlers participate in tag interpolation (parity with
 *     the vue/react/solid wrappers);
 *   - children snippet acts as missing-translation fallback;
 *   - a fallback-parity fixture pins the same template + params table the
 *     vue/react wrappers produce (the cross-wrapper harness lands in Wave 2b —
 *     keep WRAPPER_PARITY_FIXTURE in sync when porting).
 *
 * Unlike the FakeI18n-driven suites, these tests run against the REAL
 * @comvi/core pipeline so tag parsing, the per-call extension channel, and
 * missing-param semantics are exercised end to end.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import { createI18n } from "@comvi/core";
import TInterpolationWrapper from "./TInterpolationWrapper.test.svelte";
import TFallbackWrapper from "./TFallback.test.svelte";
import StructuralBadge from "./StructuralBadge.test.svelte";
import type { ComponentMap } from "../src/types";

// ---------------------------------------------------------------------------
// Shared fallback-parity fixture (same table as the vue/react wrappers)
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
  createI18n({ locale: "en", exposeGlobal: false, translation: { en: translations } });

describe("T.svelte structural render", () => {
  let target: HTMLElement;
  let component: Record<string, unknown> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = null;
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  it("has no HTML-string sink in the component source (grep gate: {@html})", () => {
    const source = readFileSync("src/T.svelte", "utf8");
    expect(source).not.toContain("{@html");
    expect(source).not.toContain("innerHTML");
  });

  it("renders nested tags as real nested DOM elements", () => {
    const i18n = makeI18n({ nested: "Read <outer>the <inner>fine</inner> print</outer>." });

    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n,
        i18nKey: "nested",
        components: { outer: "strong", inner: "em" },
      },
    });

    const strong = target.querySelector("strong");
    expect(strong).not.toBeNull();
    const em = strong!.querySelector("em");
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe("fine");
    expect(target.textContent).toContain("Read the fine print.");
  });

  it("renders untrusted translation markup as text, never as elements", () => {
    const i18n = makeI18n({ evil: "hi <script>window.pwned = true</script> there" });

    component = mount(TInterpolationWrapper, { target, props: { i18n, i18nKey: "evil" } });

    // No handler for <script> → the tag falls back to its inner text; nothing
    // in a translation string can create DOM elements.
    expect(target.querySelector("script")).toBeNull();
    expect(Reflect.get(window, "pwned")).toBeUndefined();
    expect(target.textContent).toContain("hi ");
    expect(target.textContent).toContain(" there");
  });

  describe("component handlers (wrapper parity)", () => {
    it("invokes a Svelte component handler with the tag content as children", () => {
      const i18n = makeI18n({ earned: "You earned <badge>gold</badge>!" });

      component = mount(TInterpolationWrapper, {
        target,
        props: {
          i18n,
          i18nKey: "earned",
          components: { badge: StructuralBadge } as ComponentMap,
        },
      });

      const badge = target.querySelector('[data-testid="badge"]');
      expect(badge).not.toBeNull();
      expect(badge!.tagName.toLowerCase()).toBe("mark");
      expect(badge!.getAttribute("data-variant")).toBe("default");
      expect(badge!.textContent).toBe("gold");
      expect(target.textContent).toBe("You earned gold!");
    });

    it("passes config-form props to a component handler", () => {
      const i18n = makeI18n({ earned: "You earned <badge>silver</badge>!" });

      component = mount(TInterpolationWrapper, {
        target,
        props: {
          i18n,
          i18nKey: "earned",
          components: { badge: { tag: StructuralBadge, props: { variant: "hot" } } } as ComponentMap,
        },
      });

      const badge = target.querySelector('[data-testid="badge"]');
      expect(badge).not.toBeNull();
      expect(badge!.getAttribute("data-variant")).toBe("hot");
      expect(badge!.textContent).toBe("silver");
    });
  });

  it("renders the children snippet as fallback for a missing key", () => {
    const i18n = makeI18n({});

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n, i18nKey: "missing.key", useSlot: true },
    });

    expect(target.textContent).toContain("Slot fallback");
    expect(target.textContent).not.toContain("missing.key");
  });

  describe("fallback-parity fixture (shared with vue/react)", () => {
    for (const parityCase of WRAPPER_PARITY_FIXTURE.cases) {
      it(`produces the shared text for "${parityCase.key}"`, () => {
        const i18n = makeI18n({ ...WRAPPER_PARITY_FIXTURE.translations });

        component = mount(TInterpolationWrapper, {
          target,
          props: {
            i18n,
            i18nKey: parityCase.key,
            params: { ...parityCase.params },
            components: { ...parityCase.components } as ComponentMap,
          },
        });

        expect(target.textContent).toBe(parityCase.text);
      });
    }
  });
});
