/**
 * The scope of `isReady` / `isLoading` (owner brief 2026-11-10): `useI18n()` (or `undefined`)
 * reads the configured namespaces (`namespaces`, default `["default"]`) — every one ready,
 * some loading — and `useI18n(ns)` only `ns`; `t` and the bound `T` of `useI18n()` stay on
 * `default`. A Svelte server render is synchronous: the app loads first (`await i18n.ready`).
 * Contract: `.lot1-pending-tests.md` "Ready/loading scope of `useI18n()`".
 */
import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { type I18n } from "../src";
import { core, state } from "../../core/src/internal";
import Bound from "./fixtures/Bound.svelte";
import Global from "./fixtures/Global.svelte";
import Probe from "./fixtures/Probe.svelte";
import { make, manualLoader, mountWith, settle } from "./helpers";

/** `useI18n()` (Global) and `useI18n(ns)` probes side by side, each with its frames. */
const mountAll = (i18n: I18n, ...nss: (string | undefined)[]) => {
  const all: string[] = [];
  const g = mountWith(i18n, Global, { frames: all });
  const each = nss.map((ns) => {
    const frames: string[] = [];
    mountWith(i18n, Probe, { ns, k: "hi", frames });
    return frames;
  });
  return { all, each, text: g.text };
};

describe("useI18n() reads the configured namespaces; useI18n(ns) only ns", () => {
  it("1, 2: with two configured namespaces it is ready only when both are; an explicit one alone", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["default", "nav"], loader: l.load });
    const { all, each } = mountAll(i18n, "default", "nav");
    const last = () => [all.at(-1), each[0].at(-1), each[1].at(-1)];
    expect(last()).toEqual(["false/true", "false/true", "false/true"]);
    await l.answer("en:default", { hi: "Hi" });
    expect(last()).toEqual(["false/true", "true/false", "false/true"]);
    await l.answer("en:nav");
    expect(last()).toEqual(["true/false", "true/false", "true/false"]);
  });

  it("3: a fallback locale's catalog makes it ready; a missing key does not reset it", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "uk",
      fallbackLocale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { uk: { hi: "Привіт" } } },
      loader: l.load,
    });
    const { all, text } = mountAll(i18n);
    const missing = mountWith(i18n, Probe, { k: "nope", frames: [] });
    expect(all.at(-1)).toBe("false/true");
    await l.fail("uk:nav");
    for (const k of l.requested.filter((k) => k != "uk:nav")) await l.answer(k);
    expect(all.at(-1)).toBe("true/false");
    expect([text(), missing.text()]).toEqual(["Привіт0", "nope"]);
  });

  it("4: a failure with no usable catalog is false/false; load(ns) retries and the flags follow", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } } },
      loader: l.load,
    });
    const { all, text } = mountAll(i18n);
    await l.fail("en:nav");
    expect([all.at(-1), text()]).toEqual(["false/false", "unavailable0"]);
    const p = i18n.load("nav");
    await settle();
    expect(all.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    await p;
    expect([all.at(-1), text()]).toEqual(["true/false", "Hi0"]);
  });

  it("5: loading a namespace outside the set leaves the flags as they are", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const { all, each } = mountAll(i18n, "account");
    expect([all.at(-1), each[0].at(-1)]).toEqual(["true/false", "false/true"]);
    const p = i18n.load("extra");
    await l.answer("en:account");
    expect(each[0].at(-1)).toBe("true/false");
    await l.answer("en:extra");
    await p;
    expect(new Set(all)).toEqual(new Set(["true/false"]));
  });

  it("6: a switch keeps the text on screen while isLoading is true", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const { all, text } = mountAll(i18n);
    const p = i18n.setLocale("de");
    await settle();
    expect([all.at(-1), text()]).toEqual(["true/true", "Hi0"]);
    await l.answer("de:default", { hi: "Hallo" });
    expect([all.at(-1), text()]).toEqual(["true/true", "Hi0"]);
    await l.answer("de:nav");
    await p;
    await settle();
    expect([all.at(-1), text()]).toEqual(["true/false", "Hallo0"]);
  });
});

describe("7: the default set, an empty set, a set without default, an explicit undefined", () => {
  it("no namespaces option: the set is default", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    const { all } = mountAll(i18n);
    expect(all.at(-1)).toBe("false/true");
    await l.answer("en:default", { hi: "Hi" });
    expect(all.at(-1)).toBe("true/false");
  });

  it("namespaces: [] describes default, the namespace its t reads (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const { all } = mountAll(i18n);
    await settle();
    expect([all.at(-1), l.requested]).toEqual(["false/true", ["en:default"]]);
    await l.answer("en:default", { hi: "Hi" });
    expect(all.at(-1)).toBe("true/false");
  });

  it("a set without default covers default too: ready once nav and default are (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["nav"], loader: l.load });
    const { all } = mountAll(i18n);
    await settle();
    expect(all.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    expect(all.at(-1)).toBe("false/true");
    await l.answer("en:default", { hi: "Hi" });
    expect(all.at(-1)).toBe("true/false");
  });

  it("useI18n(undefined) is useI18n()", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } } },
      loader: l.load,
    });
    const { each } = mountAll(i18n, undefined);
    expect(each[0].at(-1)).toBe("false/true");
    await l.answer("en:nav");
    expect(each[0].at(-1)).toBe("true/false");
  });
});

describe("8: t() and the bound T of useI18n() read default", () => {
  it("the configured set's first namespace does not take over", () => {
    const { i18n } = make({
      locale: "en",
      namespaces: ["nav", "default"],
      catalogs: { default: { en: { k: "D" } }, nav: { en: { k: "N" } } },
    });
    expect(mountWith(i18n, Bound).text()).toBe("DD");
  });
});

describe("9: inline catalogs give the right first branch (the server render: hydration.test.ts)", () => {
  const OPTS = { locale: "en", timeZone: "UTC", namespaces: ["default", "nav"] };

  it("inline catalogs: ready at the first frame, no spinner", () => {
    const l = manualLoader();
    const { i18n } = make({
      ...OPTS,
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const { all } = mountAll(i18n);
    expect([all, l.requested]).toEqual([["true/false"], []]);
  });
});

describe("10: reading the flags requests, holds and publishes nothing", () => {
  it("only the hook's own hold of default; no request beyond the startup load; no publish", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } } },
      loader: l.load,
    });
    const x = core(i18n);
    const before = { requested: [...l.requested], k: { ...x.k } };
    const out: { bump?: () => void } = {};
    const g = mountWith(i18n, Global, { out });
    await settle();
    const rev = state(i18n).rev;
    out.bump!();
    flushSync();
    out.bump!();
    flushSync();
    expect(g.text()).toBe("…2");
    expect([l.requested, x.k, state(i18n).rev]).toEqual([
      before.requested,
      { ...before.k, default: before.k.default + 1 },
      rev,
    ]);
  });
});
