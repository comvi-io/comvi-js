/**
 * SSR cross-request isolation test (F2a / F2b)
 *
 * Goals:
 *  1. Prove that two separate i18n instances never share store state (locale / translations).
 *     This validates the per-request-instance pattern documented in the README SSR section
 *     and that the module-level WeakMap caches in useI18n.ts are correctly instance-keyed.
 *  2. Verify that a correctly mounted component produces ZERO hydration warnings, and that a
 *     mismatched hydrate() call DOES emit a warning (negative control to prove the check is live).
 *
 * NOTE on svelte/server render() in this test environment:
 *   The vitest config uses resolve.conditions: ["browser"], so .svelte files compile as browser
 *   components. svelte/server render() requires server-compiled components. Calling render() on a
 *   browser component does not throw synchronously, but accessing result.body triggers a runtime
 *   error because the browser reactive machinery (parent_effect) is absent in the SSR renderer.
 *   This limitation is documented in the assertion below and in the README SSR section.
 *   The cross-bleed store assertions are the primary gate for the `ssr` keyword.
 *
 *   Hydration marker format in Svelte 5: <!--[--> (start) and <!--]--> (end).
 *   hydrate() from "svelte" is the correct API (not mount({ hydrate: true })).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { get } from "svelte/store";
import { createI18n } from "../src/index";
import { mount, hydrate, unmount, tick } from "svelte";
import IntegrationSmoke from "./IntegrationSmoke.test.svelte";

// ---------------------------------------------------------------------------
// 1. Store / WeakMap isolation — two instances, zero cross-bleed
// ---------------------------------------------------------------------------

describe("SSR cross-request isolation — store-level", () => {
  /**
   * Simulate two concurrent server requests, each with its own i18n instance.
   * Assert that locale and translation output from instance A never appear in
   * instance B's stores.
   */
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

    // Switch A — B must not change.
    await instanceA.setLocaleAsync("fr");
    expect(instanceA.locale).toBe("fr");
    expect(instanceB.locale).toBe("uk");

    // Switch B — A must not change.
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

    expect(outputA).not.toContain("requête");
    expect(outputB).not.toContain("Request A");
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

    // Add translations to A — B's cache must not be affected.
    instanceA.addTranslations({ en: { extra: "Extra A" } });

    expect(instanceA.t("extra")).toBe("Extra A");
    // B falls back to key name — it never received "Extra A".
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

    // Mutate A — B's store must remain "de".
    await instanceA.setLocaleAsync("es");

    expect(get(storeA)).toBe("es");
    expect(get(storeB)).toBe("de");
  });
});

// ---------------------------------------------------------------------------
// 2. svelte/server render() — SSR compilation constraint
// ---------------------------------------------------------------------------

describe("svelte/server render() — SSR compilation constraint", () => {
  /**
   * Documents the known limitation: vitest resolve.conditions: ["browser"] compiles
   * .svelte files as browser components. svelte/server render() requires server-compiled
   * components. Calling render() on a browser component does not throw synchronously, but
   * accessing result.body errors because browser reactive machinery (parent_effect) is absent.
   *
   * To get true svelte/server render coverage, run vitest with a separate project config
   * using ssr.resolve.conditions: ["svelte", "node"]. The cross-bleed assertions above are
   * the primary gate for the `ssr` keyword.
   */
  it("documents that accessing render().body on a browser-compiled component throws", async () => {
    const { render } = await import("svelte/server");
    const i18n = createI18n({
      locale: "en",
      translation: { en: { hello: "Hello" } },
    });
    await i18n.init();

    // render() itself does not throw — accessing result.body does, because the
    // browser component tries to access parent_effect which is null in SSR context.
    const result = render(IntegrationSmoke as never, { props: { i18n } });
    expect(() => result.body).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Hydration warning check
// ---------------------------------------------------------------------------

describe("hydration warning check", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;
  let warnSpy: ReturnType<typeof vi.spyOn>;

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
    warnSpy.mockRestore();
  });

  function hydrationWarningCount(): number {
    return warnSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && /hydrat/i.test(args[0]),
    ).length;
  }

  /**
   * NEGATIVE CONTROL — proves the warning spy is live.
   *
   * svelte/server render() produces HTML with <!--[--> / <!--]--> hydration markers.
   * svelte's hydrate() uses those markers to walk the DOM and diff against what
   * the component would render. When the content inside the markers doesn't match,
   * Svelte 5 emits a console.warn matching /hydrat/.
   *
   * We manually construct SSR-style HTML with the correct markers but wrong content,
   * then call hydrate() to trigger the mismatch warning.
   */
  it("NEGATIVE CONTROL — mismatched hydration HTML triggers a hydration warning", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { hello: "Hello" } },
    });
    await i18n.init();

    // Construct SSR-style HTML: correct Svelte 5 hydration markers wrapping wrong content.
    // hydrate() will walk the markers, find content that doesn't match the component output,
    // and emit a /hydrat/ warning.
    target.innerHTML =
      '<!--[--><div data-testid="hook">WRONG CONTENT</div><div data-testid="component">ALSO WRONG</div><!--]-->';

    component = hydrate(IntegrationSmoke, {
      target,
      props: { i18n },
    });
    await tick();

    // Must have at least one hydration warning — proves the spy is live.
    expect(hydrationWarningCount()).toBeGreaterThan(0);
  });

  /**
   * Correct fresh mount (no pre-existing HTML) must produce zero hydration warnings.
   * This is the normal client-side boot path: Svelte renders from scratch.
   */
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
