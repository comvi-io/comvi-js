/**
 * a11y tests for safe defaults injected by T.svelte's buildAttrs:
 *   1. <a target="_blank"> without rel gets rel="noopener noreferrer" automatically.
 *   2. <img> without alt gets alt="" automatically.
 *
 * These guards apply to HTML produced via {@html} where the browser would not
 * otherwise enforce these safety/accessibility conventions.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import TInterpolationWrapper from "./TInterpolationWrapper.test.svelte";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import type { TranslationResult } from "@comvi/core";

// ---------------------------------------------------------------------------
// Shared fake i18n factory — returns the relevant virtual node from a callback
// ---------------------------------------------------------------------------

const createA11yI18n = (): FakeI18n => {
  const fake = new FakeI18n({ language: "en", defaultNamespace: "default" });
  fake.addTranslations({ en: { linktest: "x", imgtest: "x" } });
  return fake;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("T.svelte a11y safe defaults in buildAttrs", () => {
  let fake: FakeI18n;
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    fake = createA11yI18n();
    component = null;
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  // -------------------------------------------------------------------------
  // 1. <a target="_blank"> without rel → inject rel="noopener noreferrer"
  // -------------------------------------------------------------------------

  describe('<a target="_blank"> tab-napping guard', () => {
    it('injects rel="noopener noreferrer" when target="_blank" and rel is absent', () => {
      fake.tImplementation = (key, params): TranslationResult => {
        const link =
          typeof params?.link === "function"
            ? params.link({ children: "click here", name: "link" })
            : "click here";
        return [link];
      };

      component = mount(TInterpolationWrapper, {
        target,
        props: {
          i18n: fake.asI18n(),
          i18nKey: "linktest",
          components: {
            link: { tag: "a", props: { href: "https://example.com", target: "_blank" } },
          },
        },
      });

      const anchor = target.querySelector("a");
      expect(anchor).not.toBeNull();
      expect(anchor!.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it('does NOT override an explicit rel when target="_blank"', () => {
      fake.tImplementation = (key, params): TranslationResult => {
        const link =
          typeof params?.link === "function"
            ? params.link({ children: "click here", name: "link" })
            : "click here";
        return [link];
      };

      component = mount(TInterpolationWrapper, {
        target,
        props: {
          i18n: fake.asI18n(),
          i18nKey: "linktest",
          components: {
            link: {
              tag: "a",
              props: { href: "https://example.com", target: "_blank", rel: "noopener" },
            },
          },
        },
      });

      const anchor = target.querySelector("a");
      expect(anchor).not.toBeNull();
      // The explicitly provided rel must be preserved as-is
      expect(anchor!.getAttribute("rel")).toBe("noopener");
    });

    it('does NOT add rel when target is not "_blank"', () => {
      fake.tImplementation = (key, params): TranslationResult => {
        const link =
          typeof params?.link === "function"
            ? params.link({ children: "click here", name: "link" })
            : "click here";
        return [link];
      };

      component = mount(TInterpolationWrapper, {
        target,
        props: {
          i18n: fake.asI18n(),
          i18nKey: "linktest",
          components: {
            link: { tag: "a", props: { href: "https://example.com", target: "_self" } },
          },
        },
      });

      const anchor = target.querySelector("a");
      expect(anchor).not.toBeNull();
      expect(anchor!.getAttribute("rel")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. <img> without alt → inject alt=""
  // -------------------------------------------------------------------------

  describe("<img> empty-alt fallback", () => {
    it('injects alt="" on <img> when alt is absent', () => {
      fake.tImplementation = (key, params): TranslationResult => {
        const img =
          typeof params?.icon === "function" ? params.icon({ children: [], name: "icon" }) : "";
        return [img];
      };

      component = mount(TInterpolationWrapper, {
        target,
        props: {
          i18n: fake.asI18n(),
          i18nKey: "imgtest",
          components: {
            icon: { tag: "img", props: { src: "/logo.png" } },
          },
        },
      });

      const img = target.querySelector("img");
      expect(img).not.toBeNull();
      expect(img!.getAttribute("alt")).toBe("");
    });

    it("does NOT override an explicit alt attribute", () => {
      fake.tImplementation = (key, params): TranslationResult => {
        const img =
          typeof params?.icon === "function" ? params.icon({ children: [], name: "icon" }) : "";
        return [img];
      };

      component = mount(TInterpolationWrapper, {
        target,
        props: {
          i18n: fake.asI18n(),
          i18nKey: "imgtest",
          components: {
            icon: { tag: "img", props: { src: "/logo.png", alt: "Company logo" } },
          },
        },
      });

      const img = target.querySelector("img");
      expect(img).not.toBeNull();
      expect(img!.getAttribute("alt")).toBe("Company logo");
    });
  });
});
