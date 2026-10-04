/**
 * `$isInitializing` closes the documented gate from the FIRST render.
 *
 * `setI18nContext` schedules its auto-init in a microtask (so a manual
 * `i18n.init()` in the same setup still wins without a double init), and the
 * component renders synchronously before that microtask. `isInitializing`
 * used to read false in that render, so `{#if $isInitializing}` let the raw
 * keys through for one delivered mutation batch (examples:e2e step r, svelte:
 * `greeting="greeting.hello"`). While the auto-init is scheduled it now reads
 * true.
 */
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import { createI18n, loader } from "../src/index";
import InitGateHarness from "./InitGateHarness.test.svelte";

describe("setI18nContext + the $isInitializing gate", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target?.remove();
  });

  it("never renders a raw key: the gate is closed from the first render on", async () => {
    let resolve!: (catalog: Record<string, string>) => void;
    const i18n = createI18n({ locale: "en" }).use(
      loader({ en: () => new Promise((done) => (resolve = (c) => done({ default: c }))) }),
    );
    target = document.createElement("div");
    document.body.appendChild(target);
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(target.textContent ?? ""));
    observer.observe(target, { subtree: true, childList: true, characterData: true });

    component = mount(InitGateHarness, { target, props: { i18n } });
    flushSync();
    // The first render, before the auto-init microtask has run.
    expect(target.textContent?.trim()).toBe("Loading…");

    await tick();
    expect(i18n.isInitializing).toBe(true);
    expect(target.textContent?.trim()).toBe("Loading…");

    resolve({ greeting: "Hello" });
    await i18n.init();
    await tick();
    expect(target.textContent?.trim()).toBe("Hello");
    // Every delivered batch: the gate or the text, never the key.
    await Promise.resolve();
    observer.disconnect();
    expect(seen.filter((text) => text.includes("greeting"))).toEqual([]);
  });

  it("autoInit: false leaves the gate to the app: nothing is scheduled", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    target = document.createElement("div");
    document.body.appendChild(target);
    // Initialized before the context is set: there is nothing to wait for.
    return i18n.init().then(() => {
      component = mount(InitGateHarness, { target, props: { i18n } });
      flushSync();
      expect(target.textContent?.trim()).toBe("Hello");
    });
  });
});
