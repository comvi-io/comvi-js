/**
 * `@comvi/svelte`'s bindings on the BASE host — a host that implements
 * `WrapperI18nHost` and nothing more. Svelte is the wrapper where promising
 * capability members crashed EAGERLY: `useI18n()` `.bind()`s its members in
 * the object literal it returns, so a base host threw "Cannot read properties
 * of undefined (reading 'bind')" before a single translation rendered.
 *
 * The ENTRY itself — export surface, ICU shapes, toolkit identity — is pinned
 * in tests/root-entry.test.ts. The loud-error half of the capability contract
 * (exact dev AND prod messages) lives in tests/js-contract/, against the
 * published dist under both build conditions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { attachLoader, createI18n } from "../src/index";
import type { WrapperI18nHost } from "../src/index";
import type { UseI18nReturn } from "../src/useI18n";
import BaseHostHarness from "./BaseHostHarness.test.svelte";
import TInterpolationWrapper from "./TInterpolationWrapper.test.svelte";

// Two views of one instance: `attachLoader` composes onto the concrete class,
// so it takes `makeCoreHost()`, while `makeHost()` is that same object seen
// through the base-host type this suite is about.
const makeCoreHost = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: {
      en: { greeting: "Hello, {name}!", rich: "Click <link>here</link>" },
      fr: { greeting: "Bonjour, {name} !", rich: "Cliquez <link>ici</link>" },
    },
  });

const makeHost = (): WrapperI18nHost => makeCoreHost();

describe("svelte on a base host", () => {
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
    component = mount(BaseHostHarness, {
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

    const members = bag as unknown as Record<string, unknown>;
    const hostSafe = ["t", "tRaw", "setLocale", "addTranslations", "on", "reportError"];
    const capabilityOnly = [
      "addActiveNamespace",
      "reloadTranslations",
      "onLoadError",
      "onMissingKey",
    ];

    expect(hostSafe.filter((name) => members[name] === undefined)).toEqual([]);
    expect(capabilityOnly.filter((name) => name in members)).toEqual([]);
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

    await vi.waitFor(() => {
      expect(i18n.locale).toBe("fr");
    });
  });

  it("formats through the bag's Intl helpers", () => {
    render(makeHost());

    // The host locale is "en", so both literals are a function of the fixture.
    expect(text("number")).toBe("1,234.5");
    expect(text("currency")).toBe("$10.00");
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

describe("svelte on base + attachLoader (composed host)", () => {
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

  it("keeps useI18n()'s bag identical to the base one", () => {
    const bags: UseI18nReturn[] = [];
    for (const i18n of [makeHost(), attachLoader(makeCoreHost())]) {
      mounted.push(
        mount(BaseHostHarness, {
          target,
          props: { i18n, report: (value: UseI18nReturn) => bags.push(value) },
        }),
      );
    }

    const baseKeys = Object.keys(bags[0]).sort();

    // Anchored: two empty bags would satisfy the equality below.
    expect(baseKeys).toContain("t");
    expect(Object.keys(bags[1]).sort()).toEqual(baseKeys);
  });
});
