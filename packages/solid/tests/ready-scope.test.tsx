/**
 * The scope of `isReady` / `isLoading` (owner brief 2026-11-10): `useI18n()` (or `undefined`)
 * reads the configured namespaces (`namespaces`, default `["default"]`) — every one ready,
 * some loading — and `useI18n(ns)` only `ns`; `t` and the bound `T` of `useI18n()` stay on
 * `default`. The server half of check 9 is tests/ssr/ready-scope.test.tsx. Contract:
 * `.lot1-pending-tests.md` "Ready/loading scope of `useI18n()`".
 */
import { createEffect, createSignal, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n, type I18n } from "../src";
import { core, state } from "../../core/src/internal";
import { make, manualLoader, tick } from "./helpers";

/** Every state's `isReady/isLoading` of `useI18n(...args)`, and the branch it shows. */
const probe = (...args: [] | [string | undefined]) => {
  const frames: string[] = [];
  const P = () => {
    const { t, isReady, isLoading } = useI18n(...(args as [string]));
    createEffect(() => frames.push(`${isReady()}/${isLoading()}`));
    return <p>{isReady() ? (t("hi") as string) : isLoading() ? "…" : "unavailable"}</p>;
  };
  return { P, frames };
};

const app = (i18n: I18n, children: () => JSX.Element) =>
  render(() => <I18nProvider i18n={i18n}>{children()}</I18nProvider>);

describe("useI18n() reads the configured namespaces; useI18n(ns) only ns", () => {
  it("1, 2: with two configured namespaces it is ready only when both are; an explicit one alone", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["default", "nav"], loader: l.load });
    const all = probe();
    const def = probe("default");
    const nav = probe("nav");
    app(i18n, () => [<all.P />, <def.P />, <nav.P />]);
    await tick();
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
    const Missing = () => <i>{useI18n().t("nope") as string}</i>;
    const { container } = app(i18n, () => [<all.P />, <Missing />]);
    await tick();
    expect(all.frames.at(-1)).toBe("false/true");
    await l.fail("uk:nav");
    for (const k of l.requested.filter((k) => k != "uk:nav")) await l.answer(k);
    expect(all.frames.at(-1)).toBe("true/false");
    expect(container.textContent).toBe("Привітnope");
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
    const { container } = app(i18n, () => <all.P />);
    await l.fail("en:nav");
    expect([all.frames.at(-1), container.textContent]).toEqual(["false/false", "unavailable"]);
    const p = i18n.load("nav");
    await tick();
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    await p;
    expect([all.frames.at(-1), container.textContent]).toEqual(["true/false", "Hi"]);
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
    app(i18n, () => [<all.P />, <account.P />]);
    await tick();
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
    const { container } = app(i18n, () => <all.P />);
    const p = i18n.setLocale("de");
    await tick();
    expect([all.frames.at(-1), container.textContent]).toEqual(["true/true", "Hi"]);
    await l.answer("de:default", { hi: "Hallo" });
    expect([all.frames.at(-1), container.textContent]).toEqual(["true/true", "Hi"]);
    await l.answer("de:nav");
    await p;
    expect([all.frames.at(-1), container.textContent]).toEqual(["true/false", "Hallo"]);
  });
});

describe("7: the default set, an empty set, a set without default, an explicit undefined", () => {
  it("no namespaces option: the set is default", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    const all = probe();
    app(i18n, () => <all.P />);
    await tick();
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:default", { hi: "Hi" });
    expect(all.frames.at(-1)).toBe("true/false");
  });

  it("namespaces: [] describes default, the namespace its t reads (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const all = probe();
    app(i18n, () => <all.P />);
    await tick();
    expect([all.frames.at(-1), l.requested]).toEqual(["false/true", ["en:default"]]);
    await l.answer("en:default", { hi: "Hi" });
    expect(all.frames.at(-1)).toBe("true/false");
  });

  it("a set without default covers default too: ready once nav and default are (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["nav"], loader: l.load });
    const all = probe();
    app(i18n, () => <all.P />);
    await tick();
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
    app(i18n, () => <u.P />);
    await tick();
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
    const P = () => {
      const { t, T } = useI18n();
      return (
        <p>
          {t("k") as string}
          <T i18nKey="k" />
        </p>
      );
    };
    const { container } = app(i18n, () => <P />);
    expect(container.textContent).toBe("DD");
  });
});

describe("9: inline catalogs give the right first branch", () => {
  it("inline catalogs: ready at the first frame, no spinner", () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const all = probe();
    app(i18n, () => <all.P />);
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
    const [bump, setBump] = createSignal(0);
    const P = () => {
      const { isReady, isLoading } = useI18n();
      return <p>{`${bump()}${isReady()}/${isLoading()}`}</p>;
    };
    app(i18n, () => <P />);
    await tick();
    const rev = state(i18n).rev;
    setBump(1);
    setBump(2);
    await tick();
    expect([l.requested, x.k, state(i18n).rev]).toEqual([
      before.requested,
      { ...before.k, default: before.k.default + 1 },
      rev,
    ]);
  });
});
