/**
 * `<T skipPostProcess>` skips the post-processors that honour it. Mirrors
 * `react/tests/T.behavior.test.tsx` and `solid/tests/T.test.tsx`'s equivalent
 * coverage.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import TSkipPostProcessWrapper from "./TSkipPostProcess.test.svelte";
import { createI18n, plugins } from "../src/index";
import type { TranslationParams, TranslationResult } from "@comvi/core";

/** A plugins host whose post-processor upper-cases anything not asked for raw. */
const hostWithUppercasePostProcessor = () => {
  const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(plugins());
  i18n.addMessages({ "en:default": { greeting: "hello" } });
  i18n.registerPostProcessor(
    (result: TranslationResult, _key: string, _ns: string, params: TranslationParams) => {
      if (params?.raw === true) {
        return result;
      }
      return typeof result === "string" ? result.toUpperCase() : result;
    },
  );
  return i18n;
};

describe("T.svelte skipPostProcess", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  const rendered = () =>
    target.querySelector('[data-testid="t-skip-post-process"]')?.textContent ?? null;

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

  it("applies post-processing when skipPostProcess is not set", () => {
    component = mount(TSkipPostProcessWrapper, {
      target,
      props: { i18n: hostWithUppercasePostProcessor(), i18nKey: "greeting" },
    });

    expect(rendered()).toBe("HELLO");
  });

  it("skips post-processing via skipPostProcess", () => {
    component = mount(TSkipPostProcessWrapper, {
      target,
      props: { i18n: hostWithUppercasePostProcessor(), i18nKey: "greeting", skipPostProcess: true },
    });

    expect(rendered()).toBe("hello");
  });
});
