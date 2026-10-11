/**
 * `<T markers={false}>` keeps the in-context editor's invisible markers out of the result. Mirrors
 * `react/tests/T.behavior.test.tsx` and `solid/tests/T.test.tsx`'s equivalent
 * coverage.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import TMarkersWrapper from "./TMarkers.test.svelte";
import { createI18n, plugins } from "../src/index";
import type { TranslationParams, TranslationResult } from "@comvi/core";

/** A plugins host whose post-processor upper-cases anything not marked `markers: false`. */
const hostWithUppercasePostProcessor = () => {
  const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(plugins());
  i18n.addMessages({ "en:default": { greeting: "hello" } });
  i18n.registerPostProcessor(
    (result: TranslationResult, _key: string, _ns: string, params: TranslationParams) => {
      if (params?.markers === false) {
        return result;
      }
      return typeof result === "string" ? result.toUpperCase() : result;
    },
  );
  return i18n;
};

describe("T.svelte markers", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  const rendered = () => target.querySelector('[data-testid="t-markers"]')?.textContent ?? null;

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

  it("applies post-processing when markers is not set", () => {
    component = mount(TMarkersWrapper, {
      target,
      props: { i18n: hostWithUppercasePostProcessor(), i18nKey: "greeting" },
    });

    expect(rendered()).toBe("HELLO");
  });

  it("leaves the result unmarked via markers={false}", () => {
    component = mount(TMarkersWrapper, {
      target,
      props: { i18n: hostWithUppercasePostProcessor(), i18nKey: "greeting", markers: false },
    });

    expect(rendered()).toBe("hello");
  });
});
