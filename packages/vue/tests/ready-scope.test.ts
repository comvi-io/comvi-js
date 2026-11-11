/**
 * The scope of `isReady` / `isLoading` (owner brief 2026-11-10): `useI18n()` (or `undefined`)
 * reads the configured namespaces (`namespaces`, default `["default"]`) — every one ready,
 * some loading — and `useI18n(ns)` only `ns`; `t` and the bound `T` of `useI18n()` stay on
 * `default`. A server render of `useI18n()` waits for the set too (else the server renders the
 * loading branch and the browser, handed the catalog, the content). Contract:
 * `.lot1-pending-tests.md` "Ready/loading scope of `useI18n()`".
 */
import { defineComponent, h, ref } from "vue";
import { describe, expect, it } from "vitest";
import { useI18n, type I18nOptions, type VueI18n } from "../src";
import { core, state } from "../../core/src/internal";
import { make, manualLoader, mountWith, settle } from "./helpers";

/** Every render's `isReady/isLoading` of `useI18n(...args)`, and the branch it shows. */
const probe = (...args: [] | [string | undefined]) => {
  const frames: string[] = [];
  const C = defineComponent({
    setup() {
      const { t, isReady, isLoading } = useI18n(...(args as [string]));
      return () => {
        frames.push(`${isReady.value}/${isLoading.value}`);
        return h("p", isReady.value ? t("hi") : isLoading.value ? "…" : "unavailable");
      };
    },
  });
  return { C, frames };
};

/** Mounts the probes side by side. */
const mountAll = (i18n: VueI18n, ...cs: ReturnType<typeof probe>[]) =>
  mountWith(
    i18n,
    defineComponent({
      setup: () => () =>
        h(
          "div",
          cs.map((c) => h(c.C)),
        ),
    }),
  );

describe("useI18n() reads the configured namespaces; useI18n(ns) only ns", () => {
  it("1, 2: with two configured namespaces it is ready only when both are; an explicit one alone", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["default", "nav"], loader: l.load });
    const all = probe();
    const def = probe("default");
    const nav = probe("nav");
    mountAll(i18n, all, def, nav);
    await settle();
    const last = () => [all.frames.at(-1), def.frames.at(-1), nav.frames.at(-1)];
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
    const all = probe();
    const Missing = defineComponent({
      setup() {
        const { t } = useI18n();
        return () => h("i", t("nope"));
      },
    });
    const w = mountWith(
      i18n,
      defineComponent({ setup: () => () => h("div", [h(all.C), h(Missing)]) }),
    );
    await settle();
    expect(all.frames.at(-1)).toBe("false/true");
    await l.fail("uk:nav");
    for (const k of [...l.pending.keys()]) await l.answer(k);
    expect(all.frames.at(-1)).toBe("true/false");
    expect(w.text()).toBe("Привітnope");
  });

  it("4: a failure with no usable catalog is false/false; load(ns) retries and the flags follow", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } } },
      loader: l.load,
    });
    const all = probe();
    const w = mountAll(i18n, all);
    await l.fail("en:nav");
    expect([all.frames.at(-1), w.text()]).toEqual(["false/false", "unavailable"]);
    const p = i18n.load("nav");
    await settle();
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    await p;
    expect([all.frames.at(-1), w.text()]).toEqual(["true/false", "Hi"]);
  });

  it("5: loading a namespace outside the set leaves the flags as they are", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const all = probe();
    const account = probe("account");
    mountAll(i18n, all, account);
    await settle();
    expect([all.frames.at(-1), account.frames.at(-1)]).toEqual(["true/false", "false/true"]);
    const p = i18n.load("extra");
    await l.answer("en:account");
    expect(account.frames.at(-1)).toBe("true/false");
    await l.answer("en:extra");
    await p;
    expect(new Set(all.frames)).toEqual(new Set(["true/false"]));
  });

  it("6: a switch keeps the text on screen while isLoading is true", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const all = probe();
    const w = mountAll(i18n, all);
    const p = i18n.setLocale("de");
    await settle();
    expect([all.frames.at(-1), w.text()]).toEqual(["true/true", "Hi"]);
    await l.answer("de:default", { hi: "Hallo" });
    expect([all.frames.at(-1), w.text()]).toEqual(["true/true", "Hi"]);
    await l.answer("de:nav");
    await p;
    await settle();
    expect([all.frames.at(-1), w.text()]).toEqual(["true/false", "Hallo"]);
  });
});

describe("7: the default set, an empty set, a set without default, an explicit undefined", () => {
  it("no namespaces option: the set is default", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    const all = probe();
    mountAll(i18n, all);
    await settle();
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:default", { hi: "Hi" });
    expect(all.frames.at(-1)).toBe("true/false");
  });

  it("namespaces: [] describes default, the namespace its t reads (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const all = probe();
    mountAll(i18n, all);
    await settle();
    expect([all.frames.at(-1), l.requested]).toEqual(["false/true", ["en:default"]]);
    await l.answer("en:default", { hi: "Hi" });
    expect(all.frames.at(-1)).toBe("true/false");
  });

  it("a set without default covers default too: ready once nav and default are (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["nav"], loader: l.load });
    const all = probe();
    mountAll(i18n, all);
    await settle();
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:default", { hi: "Hi" });
    expect(all.frames.at(-1)).toBe("true/false");
  });

  it("useI18n(undefined) is useI18n()", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } } },
      loader: l.load,
    });
    const u = probe(undefined);
    mountAll(i18n, u);
    await settle();
    expect(u.frames.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    expect(u.frames.at(-1)).toBe("true/false");
  });
});

describe("8: t() and the bound T of useI18n() read default", () => {
  it("the configured set's first namespace does not take over", () => {
    const { i18n } = make({
      locale: "en",
      namespaces: ["nav", "default"],
      catalogs: { default: { en: { k: "D" } }, nav: { en: { k: "N" } } },
    });
    const w = mountWith(
      i18n,
      defineComponent({
        setup() {
          const { t, T } = useI18n();
          return () => h("p", [t("k"), h(T as never, { i18nKey: "k" })]);
        },
      }),
    );
    expect(w.text()).toBe("DD");
  });
});

describe("9: inline catalogs give the right first branch (the server render: ready-scope-ssr.test.ts)", () => {
  const OPTS: I18nOptions = { locale: "en", timeZone: "UTC", namespaces: ["default", "nav"] };

  it("inline catalogs: ready at the first frame, no spinner", () => {
    const l = manualLoader();
    const { i18n } = make({
      ...OPTS,
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const all = probe();
    mountAll(i18n, all);
    expect([all.frames, l.requested]).toEqual([["true/false"], []]);
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
    const bump = ref(0);
    mountWith(
      i18n,
      defineComponent({
        setup() {
          const { isReady, isLoading } = useI18n();
          return () => h("p", `${bump.value}${isReady.value}/${isLoading.value}`);
        },
      }),
    );
    await settle();
    const rev = state(i18n).rev;
    bump.value++;
    await settle();
    bump.value++;
    await settle();
    expect([l.requested, x.k, state(i18n).rev]).toEqual([
      before.requested,
      { ...before.k, default: before.k.default + 1 },
      rev,
    ]);
  });
});
