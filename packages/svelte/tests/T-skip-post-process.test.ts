/**
 * `<T>`'s `raw` prop was renamed to `skipPostProcess` in 0.5; `raw` stays as a
 * deprecated alias for one release, with a dev-only warning that fires once.
 * Mirrors `react/tests/T.behavior.test.tsx` and `solid/tests/T.test.tsx`'s
 * equivalent coverage.
 *
 * The warn-once dedupe is keyed by HOST identity (a `WeakSet` in `T.svelte`'s
 * `<script module>` block), not a single flag, so every test below builds its
 * OWN `createI18n(...)` and its warning state starts fresh regardless of what
 * any other test already did with a DIFFERENT host.
 *
 * Getting a stable read on `IS_DEV` at all took a separate fix: this file was
 * the first thing in the svelte package to exercise `__DEV__` from a plain
 * source file (not a pre-built core dist), and doing so exposed a latent bug
 * in `vitest.config.ts` — `unit` and `ssr` both spread the SAME `define`
 * object by reference (`...shared` without a `define` override), so vitest
 * resolving those two projects concurrently could read `__DEV__` mid-mutation
 * and see it unsubstituted. Confirmed with a bare `.ts` file — no Svelte
 * component involved — reading its own `declare const __DEV__` and getting
 * `false` about 20-25% of the time; fixed by giving each project its own
 * `define` object (`freshDefine()`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
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

describe("T.svelte skipPostProcess / deprecated raw", () => {
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

  it("applies post-processing when neither prop is set", () => {
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

  it("the deprecated raw prop still skips post-processing", () => {
    component = mount(TSkipPostProcessWrapper, {
      target,
      props: { i18n: hostWithUppercasePostProcessor(), i18nKey: "greeting", raw: true },
    });

    expect(rendered()).toBe("hello");
  });

  it("skipPostProcess wins over the deprecated raw prop when both are set", () => {
    component = mount(TSkipPostProcessWrapper, {
      target,
      props: {
        i18n: hostWithUppercasePostProcessor(),
        i18nKey: "greeting",
        raw: false,
        skipPostProcess: true,
      },
    });

    expect(rendered()).toBe("hello");
  });
});

describe("T.svelte deprecated raw prop warning", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

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

  it("warns once in development when raw is used, and not for skipPostProcess", () => {
    // A host this test owns exclusively, so the per-host dedupe starts fresh
    // regardless of what any other test already did to any OTHER host.
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { greeting: "hello" } },
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      component = mount(TSkipPostProcessWrapper, {
        target,
        props: { i18n, i18nKey: "greeting", skipPostProcess: true },
      });
      flushSync();
      expect(warn).not.toHaveBeenCalled();
      unmount(component);

      component = mount(TSkipPostProcessWrapper, {
        target,
        props: { i18n, i18nKey: "greeting", raw: true },
      });
      flushSync();
      expect(target.textContent).toBe("hello");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("<T raw>");
      expect(warn.mock.calls[0]![0]).toContain("<T skipPostProcess>");
      unmount(component);

      // A second use on the SAME host does not warn again.
      component = mount(TSkipPostProcessWrapper, {
        target,
        props: { i18n, i18nKey: "greeting", raw: true },
      });
      flushSync();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("warns again for a DIFFERENT host, even right after another host's warning", () => {
    const first = createI18n({ locale: "en", exposeGlobal: false });
    const second = createI18n({ locale: "en", exposeGlobal: false });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      component = mount(TSkipPostProcessWrapper, {
        target,
        props: { i18n: first, i18nKey: "greeting", raw: true },
      });
      flushSync();
      expect(warn).toHaveBeenCalledTimes(1);
      unmount(component);

      component = mount(TSkipPostProcessWrapper, {
        target,
        props: { i18n: second, i18nKey: "greeting", raw: true },
      });
      flushSync();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
