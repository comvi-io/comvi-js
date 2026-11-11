/**
 * The scope of `isReady` / `isLoading` (owner brief 2026-11-10): `useI18n()` (or `undefined`)
 * reads the configured namespaces (`namespaces`, default `["default"]`) — every one ready,
 * some loading — and `useI18n(ns)` only `ns`; `t` and the bound `T` of `useI18n()` stay on
 * `default`. Contract: `.lot1-pending-tests.md` "Ready/loading scope of `useI18n()`".
 */
import { useState, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, useI18n, type I18n } from "../src";
import { core, handover, state } from "../../core/src/internal";
import { make, manualLoader, settle } from "./helpers";

/** Every render's `isReady/isLoading` of `useI18n(...args)`, and the branch it shows. */
const probe = (...args: [] | [string | undefined]) => {
  const frames: string[] = [];
  const P = () => {
    const { t, isReady, isLoading } = useI18n(...(args as [string]));
    frames.push(`${isReady}/${isLoading}`);
    return <p>{isReady ? (t("hi") as string) : isLoading ? "…" : "unavailable"}</p>;
  };
  return { P, frames };
};

const app = (i18n: I18n, children: ReactNode) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
);

describe("useI18n() reads the configured namespaces; useI18n(ns) only ns", () => {
  it("1, 2: with two configured namespaces it is ready only when both are; an explicit one alone", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["default", "nav"], loader: l.load });
    const all = probe();
    const def = probe("default");
    const nav = probe("nav");
    render(app(i18n, [<all.P key="a" />, <def.P key="d" />, <nav.P key="n" />]));
    expect([all.frames.at(-1), def.frames.at(-1), nav.frames.at(-1)]).toEqual([
      "false/true",
      "false/true",
      "false/true",
    ]);
    await l.answer("en:default", { hi: "Hi" });
    expect([all.frames.at(-1), def.frames.at(-1), nav.frames.at(-1)]).toEqual([
      "false/true",
      "true/false",
      "false/true",
    ]);
    await l.answer("en:nav");
    expect([all.frames.at(-1), def.frames.at(-1), nav.frames.at(-1)]).toEqual([
      "true/false",
      "true/false",
      "true/false",
    ]);
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
    const { container } = render(app(i18n, [<all.P key="a" />, <Missing key="m" />]));
    expect(all.frames.at(-1)).toBe("false/true");
    await l.fail("uk:nav");
    for (const k of [...l.pending.keys()]) await l.answer(k);
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
    const { container } = render(app(i18n, <all.P />));
    await l.fail("en:nav");
    expect([all.frames.at(-1), container.textContent]).toEqual(["false/false", "unavailable"]);
    let p!: Promise<void>;
    act(() => void (p = i18n.load("nav")));
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    await act(() => p);
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
    render(app(i18n, [<all.P key="a" />, <account.P key="c" />]));
    expect([all.frames.at(-1), account.frames.at(-1)]).toEqual(["true/false", "false/true"]);
    let p!: Promise<void>;
    act(() => void (p = i18n.load("extra")));
    await l.answer("en:account");
    expect(account.frames.at(-1)).toBe("true/false");
    await l.answer("en:extra");
    await act(() => p);
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
    const { container } = render(app(i18n, <all.P />));
    let p!: Promise<void>;
    act(() => void (p = i18n.setLocale("de")));
    expect([all.frames.at(-1), container.textContent]).toEqual(["true/true", "Hi"]);
    await l.answer("de:default", { hi: "Hallo" });
    expect([all.frames.at(-1), container.textContent]).toEqual(["true/true", "Hi"]);
    await l.answer("de:nav");
    await act(() => p);
    expect([all.frames.at(-1), container.textContent]).toEqual(["true/false", "Hallo"]);
  });
});

describe("7: the default set, an empty set, a set without default, an explicit undefined", () => {
  it("no namespaces option: the set is default", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    const all = probe();
    render(app(i18n, <all.P />));
    expect(all.frames.at(-1)).toBe("false/true");
    await l.answer("en:default", { hi: "Hi" });
    expect(all.frames.at(-1)).toBe("true/false");
  });

  it("namespaces: [] describes default, the namespace its t reads (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const all = probe();
    render(app(i18n, <all.P />));
    expect([all.frames.at(-1), l.requested]).toEqual(["false/true", ["en:default"]]);
    await l.answer("en:default", { hi: "Hi" });
    expect(all.frames.at(-1)).toBe("true/false");
  });

  it("a set without default covers default too: ready once nav and default are (owner correction)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["nav"], loader: l.load });
    const all = probe();
    render(app(i18n, <all.P />));
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
    render(app(i18n, <u.P />));
    expect(u.frames.at(-1)).toBe("false/true");
    await l.answer("en:nav");
    expect(u.frames.at(-1)).toBe("true/false");
  });

  it("a component switching from useI18n() to useI18n('default') reads the new scope", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "nav"],
      catalogs: { default: { en: { hi: "Hi" } } },
      loader: l.load,
    });
    let set!: (v: string | undefined) => void;
    const frames: boolean[] = [];
    const P = () => {
      const [ns, s] = useState<string | undefined>(undefined);
      set = s;
      frames.push(useI18n(ns).isReady);
      return null;
    };
    render(app(i18n, <P />));
    act(() => set("default"));
    expect(frames.slice(-2)).toEqual([false, true]);
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
    const { container } = render(app(i18n, <P />));
    expect(container.textContent).toBe("DD");
  });
});

describe("9: inline catalogs and a server payload give the right first branch", () => {
  const OPTS = { locale: "en", timeZone: "UTC", namespaces: ["default", "nav"] };

  it("inline catalogs: ready at the first frame, no spinner", () => {
    const l = manualLoader();
    const { i18n } = make({
      ...OPTS,
      catalogs: { default: { en: { hi: "Hi" } }, nav: { en: {} } },
      loader: l.load,
    });
    const all = probe();
    render(app(i18n, <all.P />));
    expect([all.frames, l.requested]).toEqual([["true/false"], []]);
  });

  /** Hydrates `root(i18n)` over the server's HTML; the frames of the browser's probe. */
  const hydrate = async (html: string, i18n: I18n, root: (P: () => ReactNode) => ReactNode) => {
    const container = document.createElement("div");
    container.innerHTML = html;
    const all = probe();
    const recoverable: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, root(all.P), { onRecoverableError: (e) => recoverable.push(e) });
    });
    await settle();
    const errors = [...recoverable, ...err.mock.calls];
    err.mockRestore();
    return { frames: all.frames, errors, text: container.textContent };
  };

  it("a server payload: the server's branch at the first frame, no mismatch, no request", async () => {
    const server = createI18n({
      ...OPTS,
      loader: async (_, n): Promise<Record<string, string>> => (n == "nav" ? {} : { hi: "Hi" }),
    });
    await server.ready;
    const s = probe();
    const html = renderToString(app(server, <s.P />));
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const l = manualLoader();
    const { i18n } = make({ ...OPTS, loader: l.load, ...payload });
    const h = await hydrate(html, i18n, (P) => app(i18n, <P />));
    expect([s.frames, h.frames, h.errors, h.text, l.requested]).toEqual([
      ["true/false"],
      ["true/false"],
      [],
      "Hi",
      [],
    ]);
  });

  it("<I18nHandover>: the flags read the snapshot on screen (the handed-over view), not the instance's", async () => {
    const server = createI18n({
      ...OPTS,
      loader: async (_, n): Promise<Record<string, string>> => (n == "nav" ? {} : { hi: "Hi" }),
    });
    await server.ready;
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const s = probe();
    const html = renderToString(
      app(server, <I18nHandover catalogs={payload.catalogs}>{<s.P />}</I18nHandover>),
    );
    // The browser instance has default only (and no loader: nothing of its own is in flight):
    // nav comes with the handover, published at commit.
    const { i18n } = make({ ...OPTS, catalogs: { default: { en: { hi: "Hi" } } } });
    expect(core(i18n).r(state(i18n), "nav")).toBe(false);
    const h = await hydrate(html, i18n, (P) =>
      app(i18n, <I18nHandover catalogs={payload.catalogs}>{<P />}</I18nHandover>),
    );
    expect([s.frames, h.frames[0], h.errors, h.text]).toEqual([
      ["true/false"],
      "true/false",
      [],
      "Hi",
    ]);
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
    let rerender!: () => void;
    const P = () => {
      const [, s] = useState(0);
      rerender = () => s((n) => n + 1);
      const { isReady, isLoading } = useI18n();
      return <p>{`${isReady}/${isLoading}`}</p>;
    };
    render(app(i18n, <P />));
    const rev = state(i18n).rev;
    act(() => rerender());
    act(() => rerender());
    expect([l.requested, x.k, state(i18n).rev]).toEqual([
      before.requested,
      { ...before.k, default: before.k.default + 1 },
      rev,
    ]);
  });
});
