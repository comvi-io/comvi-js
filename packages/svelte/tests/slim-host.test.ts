/**
 * framework-slim P3 — @comvi/svelte on a BARE `@comvi/core/slim` host.
 *
 * This is the D′ endpoint: the host implements `WrapperI18nHost` and nothing
 * more. Svelte is the wrapper where the pre-0.5.0 contract crashed EAGERLY —
 * `useI18n()` `.bind()`-ed `addActiveNamespace`, `reloadTranslations`,
 * `onLoadError` and `onMissingKey` in the object literal it returned, so a
 * bare-slim host threw `Cannot read properties of undefined (reading 'bind')`
 * before a single translation rendered. Every case below would fail on the
 * pre-wave wrapper.
 *
 * The loud-error side of the contract (exact dev AND prod messages) lives in
 * tests/js-contract/, which runs against the published dist under both build
 * conditions.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import type { WrapperI18nHost } from "@comvi/core";
import type { UseI18nReturn } from "../src/useI18n";
import SlimHostHarness from "./SlimHostHarness.test.svelte";
import TInterpolationWrapper from "./TInterpolationWrapper.test.svelte";

const makeHost = (): WrapperI18nHost =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: {
      en: { greeting: "Hello, {name}!", rich: "Click <link>here</link>" },
      fr: { greeting: "Bonjour, {name} !", rich: "Cliquez <link>ici</link>" },
    },
  });

describe("svelte on a bare-slim host", () => {
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

  function text(testId: string): string {
    return target.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
  }

  function click(testId: string): void {
    (target.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null)?.click();
  }

  function render(i18n: WrapperI18nHost): UseI18nReturn {
    let bag!: UseI18nReturn;
    component = mount(SlimHostHarness, {
      target,
      props: { i18n, report: (value: UseI18nReturn) => (bag = value) },
    });
    return bag;
  }

  it("renders translations through useI18n()", () => {
    render(makeHost());

    expect(text("greeting")).toBe("Hello, Ada!");
    expect(text("locale")).toBe("en");
    expect(text("dir")).toBe("ltr");
  });

  it("exposes only the host-safe bag — the four capability members are gone", () => {
    const bag = render(makeHost());

    for (const name of ["t", "tRaw", "setLocale", "addTranslations", "on", "reportError"]) {
      expect(typeof (bag as unknown as Record<string, unknown>)[name]).not.toBe("undefined");
    }
    for (const name of [
      "addActiveNamespace",
      "reloadTranslations",
      "onLoadError",
      "onMissingKey",
    ]) {
      expect(name in bag).toBe(false);
    }
  });

  it("re-renders on a locale change driven through the host", async () => {
    const i18n = makeHost();
    render(i18n);

    await i18n.setLocaleAsync("fr");
    await tick();

    expect(text("locale")).toBe("fr");
    expect(text("greeting")).toBe("Bonjour, Ada !");
  });

  it("switches locale through the bag's setLocale", async () => {
    const i18n = makeHost();
    render(i18n);

    click("switch-fr");
    await tick();
    await Promise.resolve();

    expect(i18n.locale).toBe("fr");
  });

  it("formats through the bag's Intl helpers", () => {
    render(makeHost());

    expect(text("number")).toBe(new Intl.NumberFormat("en").format(1234.5));
    expect(text("currency")).toContain("10");
  });

  it("adds translations at runtime without a loader", async () => {
    render(makeHost());

    click("add-late");
    await tick();

    expect(text("late")).toBe("Late binding");
  });

  it("renders <T> with tag interpolation (per-call extension, no ambient registration)", () => {
    component = mount(TInterpolationWrapper, {
      target,
      props: { i18n: makeHost(), i18nKey: "rich", params: {}, components: { link: "a" } },
    });

    expect(target.querySelector("a")).not.toBeNull();
    expect(target.textContent).toBe("Click here");
  });
});

describe("svelte on slim + attachLoader (composed host)", () => {
  let target: HTMLElement;
  const mounted: ReturnType<typeof mount>[] = [];

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    for (const component of mounted.splice(0)) unmount(component);
    target.remove();
  });

  it("keeps useI18n()'s bag identical to the bare-slim one", () => {
    const bags: UseI18nReturn[] = [];
    for (const i18n of [makeHost(), attachLoader(makeHost())]) {
      mounted.push(
        mount(SlimHostHarness, {
          target,
          props: { i18n, report: (value: UseI18nReturn) => bags.push(value) },
        }),
      );
    }

    expect(Object.keys(bags[1]).sort()).toEqual(Object.keys(bags[0]).sort());
  });
});
