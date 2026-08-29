// Plan §2.4 — the JS-consumer contract for the four members that LEFT
// `useI18n()` in 0.5.0.
//
// Deliberately .js + a plain-JS probe component, not .ts: a TypeScript file
// would fail to compile on every shape below, which proves nothing about what
// a JavaScript consumer experiences at runtime. Run by BOTH the
// `js-contract-dev` and `js-contract-prod` vitest projects, which pin
// `@comvi/core*` to the dev and prod build family respectively
// (vitest.config.ts).
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mount, unmount } from "svelte";
import { get } from "svelte/store";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { useI18n } from "../../src/useI18n";
import HostProbe from "./HostProbe.test.svelte";

const baseHost = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: { greeting: "Hello" } },
  });

const composedHost = () => attachPlugins(attachLoader(baseHost()));

// A capability-CARRYING host must behave exactly like the base one here: the
// members are gone from `useI18n()` by absence, not by host sniffing.
describe.each([
  ["base host", baseHost],
  ["base + attachLoader + attachPlugins", composedHost],
])("useI18n() capability-member absence (%s)", (_label, makeHost) => {
  let target;
  let component;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = null;
  });

  afterEach(() => {
    if (component) unmount(component);
    target.remove();
  });

  const bag = () => {
    let api;
    component = mount(HostProbe, {
      target,
      props: { i18n: makeHost(), read: () => useI18n(), report: (value) => (api = value) },
    });
    return api;
  };

  it("pure destructure yields undefined and calling it is a TypeError", () => {
    const { reloadTranslations } = bag();

    expect(reloadTranslations).toBeUndefined();
    expect(() => reloadTranslations()).toThrow(TypeError);
  });

  it("mixed destructure keeps the common members working", () => {
    const { t, onMissingKey } = bag();

    expect(get(t)("greeting")).toBe("Hello");
    expect(onMissingKey).toBeUndefined();
  });

  it("aliased destructure yields undefined", () => {
    const { reloadTranslations: r, addActiveNamespace: addNs } = bag();

    expect(r).toBeUndefined();
    expect(addNs).toBeUndefined();
  });

  it("property access yields undefined", () => {
    const api = bag();

    expect(api.onLoadError).toBeUndefined();
    expect(api.onMissingKey).toBeUndefined();
    expect(api.reloadTranslations).toBeUndefined();
    expect(api.addActiveNamespace).toBeUndefined();
  });

  it("does not carry the members as own or inherited keys", () => {
    const api = bag();

    for (const name of [
      "addActiveNamespace",
      "reloadTranslations",
      "onLoadError",
      "onMissingKey",
    ]) {
      expect(name in api).toBe(false);
    }
  });
});
