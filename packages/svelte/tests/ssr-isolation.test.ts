/**
 * Two i18n instances must never share store state, which is what makes the
 * per-request-instance SSR pattern safe and proves the module-level WeakMap
 * caches in useI18n.ts are instance-keyed. Plus: a correct mount emits ZERO
 * hydration warnings, and a deliberately mismatched `hydrate()` DOES emit one
 * (the negative control that keeps the check honest).
 *
 * HARNESS LIMITATION: the vitest config sets resolve.conditions ["browser"],
 * so .svelte files compile as browser components, and `svelte/server`
 * render() needs server-compiled ones. render() does not throw synchronously,
 * but reading `result.body` errors because the browser reactive machinery
 * (parent_effect) is absent in the SSR renderer. Real server-render coverage
 * needs a separate vitest project with ssr.resolve.conditions
 * ["svelte", "node"]; the cross-bleed assertions are the primary gate here.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
import { get } from "svelte/store";
import { createI18n } from "../src/index";
import { mount, hydrate, unmount, tick } from "svelte";
import IntegrationSmoke from "./IntegrationSmoke.test.svelte";

// Store / WeakMap isolation — two instances, zero cross-bleed.
describe("SSR cross-request isolation — store-level", () => {
  /** Two concurrent server requests, each with its own i18n instance. */
  it("two separate i18n instances have fully isolated locale state", async () => {
    const instanceA = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" }, fr: { greeting: "Bonjour" } },
    });
    const instanceB = createI18n({
      locale: "uk",
      translation: { uk: { greeting: "Привіт" }, de: { greeting: "Hallo" } },
    });

    await Promise.all([instanceA.init(), instanceB.init()]);

    expect(instanceA.locale).toBe("en");
    expect(instanceB.locale).toBe("uk");

    await instanceA.setLocaleAsync("fr");
    expect(instanceA.locale).toBe("fr");
    expect(instanceB.locale).toBe("uk");

    await instanceB.setLocaleAsync("de");
    expect(instanceB.locale).toBe("de");
    expect(instanceA.locale).toBe("fr");
  });

  it("translation output from instance A never bleeds into instance B", async () => {
    const instanceA = createI18n({
      locale: "en",
      translation: { en: { msg: "Request A message" } },
    });
    const instanceB = createI18n({
      locale: "fr",
      translation: { fr: { msg: "Message requête B" } },
    });

    await Promise.all([instanceA.init(), instanceB.init()]);

    const outputA = instanceA.t("msg");
    const outputB = instanceB.t("msg");

    expect(outputA).toBe("Request A message");
    expect(outputB).toBe("Message requête B");
  });

  it("translation cache is isolated per instance (WeakMap keyed by instance)", async () => {
    const instanceA = createI18n({
      locale: "en",
      translation: { en: { key: "Value A" } },
    });
    const instanceB = createI18n({
      locale: "en",
      translation: { en: { key: "Value B" } },
    });

    await Promise.all([instanceA.init(), instanceB.init()]);

    expect(instanceA.t("key")).toBe("Value A");
    expect(instanceB.t("key")).toBe("Value B");

    instanceA.addTranslations({ en: { extra: "Extra A" } });

    expect(instanceA.t("extra")).toBe("Extra A");
    // B falls back to the key: it never received "Extra A".
    expect(instanceB.t("extra")).toBe("extra");
  });

  it("locale stores derived from separate instances never share reactive state", async () => {
    const { createLocaleStore } = await import("../src/stores");

    const instanceA = createI18n({
      locale: "en",
      translation: { en: { hi: "Hi A" }, es: { hi: "Hola A" } },
    });
    const instanceB = createI18n({
      locale: "de",
      translation: { de: { hi: "Hallo B" }, es: { hi: "Hola B" } },
    });

    await Promise.all([instanceA.init(), instanceB.init()]);

    const storeA = createLocaleStore(instanceA);
    const storeB = createLocaleStore(instanceB);

    expect(get(storeA)).toBe("en");
    expect(get(storeB)).toBe("de");

    await instanceA.setLocaleAsync("es");

    expect(get(storeA)).toBe("es");
    expect(get(storeB)).toBe("de");
  });
});

// svelte/server render() — the SSR compilation constraint.
describe("svelte/server render() — SSR compilation constraint", () => {
  it("documents that accessing render().body on a browser-compiled component throws", async () => {
    const { render } = await import("svelte/server");
    const i18n = createI18n({
      locale: "en",
      translation: { en: { hello: "Hello" } },
    });
    await i18n.init();

    // render() itself does not throw; reading result.body does, because the
    // browser component dereferences a parent effect that is null under SSR.
    // Matched loosely on purpose: enough that an unrelated import/compile
    // failure cannot pass as this limitation, without pinning V8's exact
    // wording or Svelte's minified internal field name.
    const result = render(IntegrationSmoke, { props: { i18n } });
    expect(() => result.body).toThrow(/Cannot read properties of null/);
  });
});

// Hydration warning check.
describe("hydration warning check", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = null;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  function hydrationWarningCount(): number {
    return warnSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && /hydrat/i.test(args[0]),
    ).length;
  }

  /**
   * NEGATIVE CONTROL — proves the warning spy is live. Svelte 5's hydration
   * markers are `<!--[-->` / `<!--]-->`; `hydrate()` walks them and warns when
   * the content between them does not match what the component renders, so
   * this hand-builds markers around deliberately wrong content.
   */
  it("NEGATIVE CONTROL — mismatched hydration HTML triggers a hydration warning", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { hello: "Hello" } },
    });
    await i18n.init();

    target.innerHTML =
      '<!--[--><div data-testid="hook">WRONG CONTENT</div><div data-testid="component">ALSO WRONG</div><!--]-->';

    component = hydrate(IntegrationSmoke, {
      target,
      props: { i18n },
    });
    await tick();

    expect(hydrationWarningCount()).toBeGreaterThan(0);
  });

  it("correct client mount produces zero hydration warnings", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { hello: "Hello" } },
    });
    await i18n.init();

    component = mount(IntegrationSmoke, {
      target,
      props: { i18n },
    });
    await tick();

    expect(hydrationWarningCount()).toBe(0);
    expect(target.textContent).toContain("Hello-en");
  });
});
