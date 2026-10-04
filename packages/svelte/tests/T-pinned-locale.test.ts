/**
 * `<T locale="de">` pins its locale, so a change to the GLOBAL locale must not
 * make it recompute — the answer cannot have changed. Solid's
 * `createCacheRevisionSignal` already carries this contract
 * (`solid/src/primitives.ts`); this suite is Svelte's copy of it.
 *
 * `fake.tRaw` is the observable proxy for "prepareTranslation ran": every
 * recomputation of `<T>`'s `$derived.by` calls it exactly once.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import TPropForwardingWrapper from "./TPropForwarding.test.svelte";
import { createI18n } from "../src/index";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

/**
 * Mounting settles over more than one microtask: the store subscriptions land
 * after the first render, which re-runs the derived once. Counting from an
 * unsettled baseline would read that second pass as a reaction to the event.
 */
const settle = async () => {
  await tick();
  await tick();
  await tick();
};

describe("T.svelte pinned locale does not follow the global locale", () => {
  let fake: FakeI18n;
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    fake = new FakeI18n({ language: "en", defaultNamespace: "default" });
    fake.addMessages({
      en: { probe: "Probe" },
      fr: { probe: "Sonde" },
      de: { probe: "Sonde-de" },
    });
    component = null;
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  const mountT = (props: Record<string, unknown>) => {
    component = mount(TPropForwardingWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "probe", ...props },
    });
  };

  it("does not recompute a pinned <T> when the global locale changes", async () => {
    mountT({ passLocale: true, locale: "de" });
    await settle();
    const baseline = fake.tRaw.mock.calls.length;

    await fake.setLanguageAsync("fr");
    await settle();

    expect(fake.tRaw.mock.calls.length).toBe(baseline);
  });

  it("does not recompute a pinned <T> on a loading-state change", async () => {
    mountT({ passLocale: true, locale: "de" });
    await settle();
    const baseline = fake.tRaw.mock.calls.length;

    fake.emit("loadingStateChanged", { isLoading: true, isInitializing: false });
    await settle();

    expect(fake.tRaw.mock.calls.length).toBe(baseline);
  });

  it("does not recompute an unpinned <T> on a loading-state change either", async () => {
    mountT({});
    await settle();
    const baseline = fake.tRaw.mock.calls.length;

    fake.emit("loadingStateChanged", { isLoading: true, isInitializing: false });
    await settle();

    expect(fake.tRaw.mock.calls.length).toBe(baseline);
  });

  // REGRESSION GUARD (passes before and after the store change): dropping the
  // locale axis from the revision store must not stop an UNPINNED <T> from
  // following the global locale.
  it("recomputes an unpinned <T> exactly once when the global locale changes", async () => {
    mountT({});
    await settle();
    const baseline = fake.tRaw.mock.calls.length;

    await fake.setLanguageAsync("fr");
    await settle();

    expect(fake.tRaw.mock.calls.length).toBe(baseline + 1);
  });

  // REGRESSION GUARD: a cache change still reaches a pinned <T> — its own
  // locale's catalog can be replaced under it.
  it("recomputes a pinned <T> when translations change", async () => {
    mountT({ passLocale: true, locale: "de" });
    await settle();
    const baseline = fake.tRaw.mock.calls.length;

    fake.addMessages({ de: { probe: "Neu" } });
    await settle();

    expect(fake.tRaw.mock.calls.length).toBe(baseline + 1);
  });
});

/**
 * The same contract against the real core, read off the DOM: a pinned `<T>`
 * keeps its own locale's text, an unpinned one follows the global locale.
 */
describe("T.svelte pinned locale — rendered output", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  const rendered = () =>
    target.querySelector('[data-testid="t-prop-forwarding-wrapper"]')?.textContent?.trim() ?? null;

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

  it("keeps the pinned locale's text across a global locale change", async () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: {
        en: { greeting: "Hello" },
        de: { greeting: "Hallo" },
        fr: { greeting: "Bonjour" },
      },
    });

    component = mount(TPropForwardingWrapper, {
      target,
      props: { i18n, i18nKey: "greeting", passLocale: true, locale: "de" },
    });
    await settle();

    expect(rendered()).toBe("Hallo");

    await i18n.setLocale("fr");
    await settle();

    expect(rendered()).toBe("Hallo");
  });
});
