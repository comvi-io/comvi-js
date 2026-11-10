/**
 * `<I18nProvider payload>` of `@comvi/next/client` (lot 6a, brief §3, C2): the instance is
 * created once from `{ ...options, ...payload }` (data → instance → gate → content), a failed
 * slot stays failed, and a later payload of the same mount reaches the instance through
 * `<I18nHandover>`.
 */
import { useState, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useI18n } from "@comvi/react";
import type { Handover } from "@comvi/core/ssr";
import { I18nProvider } from "../src/client";

const payload = (locale: string, catalogs: Handover["catalogs"]): Handover => ({
  locale,
  timeZone: "UTC",
  serverNow: 0,
  catalogs,
});

function Probe({ ns = "default", k }: { ns?: string; k: string }) {
  const { t, isReady, isLoading, locale } = useI18n(ns);
  return (
    <p data-testid={`${ns}:${k}`} data-ready={String(isReady)} data-loading={String(isLoading)}>
      {locale}|{t(k)}
    </p>
  );
}

describe("<I18nProvider payload> of @comvi/next/client", () => {
  it("renders the payload on the first render and asks the loader for nothing", async () => {
    const loader = vi.fn(async () => ({}));
    render(
      <I18nProvider
        payload={payload("uk", { default: { uk: { hi: "Привіт" }, en: { hi: "Hi" } } })}
        options={{ fallbackLocale: "en", loader }}
      >
        <Probe k="hi" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("default:hi").textContent).toBe("uk|Привіт");
    await act(async () => {});
    expect(loader).not.toHaveBeenCalled();
  });

  it("a slot the server failed stays failed: the fallback renders and the loader is not asked", async () => {
    const loader = vi.fn(async () => ({ title: "x" }));
    render(
      <I18nProvider
        payload={payload("uk", { admin: { uk: null, en: { title: "Admin" } } })}
        options={{ fallbackLocale: "en", loader }}
      >
        <Probe ns="admin" k="title" />
      </I18nProvider>,
    );
    const el = screen.getByTestId("admin:title");
    expect(el.textContent).toBe("uk|Admin");
    expect(el.dataset.loading).toBe("false");
    await act(async () => {});
    expect(loader.mock.calls.filter((c) => (c as unknown[])[1] === "admin")).toEqual([]);
  });

  it("a later payload of the same mount renders at once and reaches the instance at commit", async () => {
    const first = payload("uk", { admin: { uk: null, en: { title: "Admin" } } });
    const tree = (p: Handover) => (
      <I18nProvider payload={p} options={{ fallbackLocale: "en" }}>
        <Probe ns="admin" k="title" />
      </I18nProvider>
    );
    const { rerender } = render(tree(first));
    expect(screen.getByTestId("admin:title").textContent).toBe("uk|Admin");
    // router.refresh(): the server loaded uk this time.
    await act(async () =>
      rerender(tree(payload("uk", { admin: { uk: { title: "Адмін" }, en: { title: "Admin" } } }))),
    );
    expect(screen.getByTestId("admin:title").textContent).toBe("uk|Адмін");
  });

  it("a payload of another locale switches the instance it created", async () => {
    const cats = { default: { uk: { hi: "Привіт" }, de: { hi: "Hallo" } } };
    const tree = (l: string) => (
      <I18nProvider payload={payload(l, cats)}>
        <Probe k="hi" />
      </I18nProvider>
    );
    const { rerender } = render(tree("uk"));
    await act(async () => rerender(tree("de")));
    expect(screen.getByTestId("default:hi").textContent).toBe("de|Hallo");
  });
});

describe("a payload's namespace and locale names are own keys (review of lot 6a)", () => {
  it("__proto__ and constructor namespaces leave Object.prototype alone and are handed over", async () => {
    const catalogs = JSON.parse(
      '{"__proto__":{"en":{"p":"Proto"}},"constructor":{"en":{"c":"Ctor"}},"default":{"en":{"hi":"Hi"}}}',
    ) as Handover["catalogs"];
    const tree = (p: Handover) => (
      <I18nProvider payload={p}>
        <Probe ns="__proto__" k="p" />
        <Probe ns="constructor" k="c" />
      </I18nProvider>
    );
    // A later payload of the same mount goes through the non-null filter.
    const { rerender } = render(tree(payload("en", { default: { en: { hi: "Hi" } } })));
    await act(async () => rerender(tree(payload("en", catalogs))));
    expect(Object.prototype).not.toHaveProperty("en");
    expect(({} as Record<string, unknown>).en).toBeUndefined();
    expect(screen.getByTestId("__proto__:p").textContent).toBe("en|Proto");
    expect(screen.getByTestId("constructor:c").textContent).toBe("en|Ctor");
  });
});

describe("a later payload means what the first one meant (lot 6a, owner decision)", () => {
  function Counter({ ns }: { ns: string }) {
    const { t, isLoading } = useI18n(ns);
    const [n, setN] = useState(0);
    return (
      <button data-testid="counter" data-loading={String(isLoading)} onClick={() => setN(n + 1)}>
        {t("title")}|{n}
      </button>
    );
  }
  const tree = (p: Handover, ns: string, loader?: (l: string, n: string) => Promise<{}>) => (
    <I18nProvider payload={p} options={{ fallbackLocale: "en", loader }}>
      <Counter ns={ns} />
    </I18nProvider>
  );

  it("a catalog that loaded, then failed on router.refresh(): the server's fallback, state kept", async () => {
    const loader = vi.fn(async (_l: string, _n: string) => ({ title: "x" }));
    const ok = payload("uk", { admin: { uk: { title: "Адмін" }, en: { title: "Admin" } } });
    const { rerender } = render(tree(ok, "admin", loader));
    expect(screen.getByTestId("counter").textContent).toBe("Адмін|0");
    fireEvent.click(screen.getByTestId("counter"));
    await act(async () =>
      rerender(
        tree(payload("uk", { admin: { uk: null, en: { title: "Admin" } } }), "admin", loader),
      ),
    );
    expect(screen.getByTestId("counter").textContent).toBe("Admin|1");
    await act(async () => {});
    expect(loader.mock.calls.filter((c) => c[1] === "admin")).toEqual([]);
  });

  it("a namespace first handed over as null in a later payload: no request until a retry", async () => {
    const loader = vi.fn(async (_l: string, _n: string) => ({ title: "Адмін" }));
    const first = payload("uk", { default: { uk: {}, en: {} } });
    const { rerender } = render(tree(first, "default", loader));
    await act(async () =>
      rerender(
        tree(
          payload("uk", {
            default: { uk: {}, en: {} },
            admin: { uk: null, en: { title: "Admin" } },
          }),
          "admin",
          loader,
        ),
      ),
    );
    expect(screen.getByTestId("counter").textContent).toBe("Admin|0");
    await act(async () => {});
    expect(loader.mock.calls.filter((c) => c[1] === "admin")).toEqual([]);
  });
});

describe("a repeated successful payload (lot 6a audit, finding 2)", () => {
  it("a key the server no longer has renders missing on the client too", async () => {
    const tree = (p: Handover) => (
      <I18nProvider payload={p}>
        <Probe k="b" />
      </I18nProvider>
    );
    const { rerender } = render(tree(payload("en", { default: { en: { a: "A", b: "B" } } })));
    expect(screen.getByTestId("default:b").textContent).toBe("en|B");
    await act(async () => rerender(tree(payload("en", { default: { en: { a: "A" } } }))));
    expect(screen.getByTestId("default:b").textContent).toBe("en|b");
  });
});

function Show() {
  const { t } = useI18n();
  return (
    <p data-testid="show">
      {t("v") as string}|{t("r") as ReactNode}
    </p>
  );
}

function Show2() {
  return <p data-testid="p">{useI18n().t("p") as string}</p>;
}

describe("defaultParams from the server's settings (owner decision 2026-11-10)", () => {
  const cats = { default: { en: { hi: "Welcome to {brand}" } } };
  function Counted() {
    const [n, setN] = useState(0);
    const { t } = useI18n();
    return (
      <button data-testid="c" onClick={() => setN(n + 1)}>
        {t("hi") as string}|{t("hi", { brand: "Explicit" }) as string}|{n}
      </button>
    );
  }
  const tree = (defaultParams?: Record<string, string>) => (
    <I18nProvider payload={payload("en", cats)} options={defaultParams && { defaultParams }}>
      <Counted />
    </I18nProvider>
  );

  it("a repeated payload changes, then clears them: no remount, state kept; an explicit param wins", async () => {
    const { rerender } = render(tree({ brand: "Comvi" }));
    const c = () => screen.getByTestId("c").textContent;
    expect(c()).toBe("Welcome to Comvi|Welcome to Explicit|0");
    fireEvent.click(screen.getByTestId("c"));
    await act(async () => rerender(tree({ brand: "Comvi 2" })));
    expect(c()).toBe("Welcome to Comvi 2|Welcome to Explicit|1");
    await act(async () => rerender(tree()));
    expect(c()).toBe("Welcome to {brand}|Welcome to Explicit|1");
  });

  it("an own `__proto__` param of a repeated payload changes, then clears (as in @comvi/react's handover)", async () => {
    const own = (v: string) => JSON.parse(`{"__proto__": ${JSON.stringify(v)}}`);
    const proto = (dp: Record<string, string> | undefined) => (
      <I18nProvider
        payload={payload("en", { default: { en: { p: "[{__proto__}]" } } })}
        options={dp && { defaultParams: dp }}
      >
        <Show2 />
      </I18nProvider>
    );
    const { rerender } = render(proto(own("one")));
    const p = () => screen.getByTestId("p").textContent;
    expect(p()).toBe("[one]");
    await act(async () => rerender(proto(own("two"))));
    expect(p()).toBe("[two]");
    await act(async () => rerender(proto(undefined)));
    expect(p()).toBe("[{__proto__}]");
  });

  it("no server params and no client ones: the provider hands `{}`, so nothing is applied (pinning)", async () => {
    const { rerender } = render(tree());
    expect(screen.getByTestId("c").textContent).toBe("Welcome to {brand}|Welcome to Explicit|0");
    await act(async () => rerender(tree()));
    expect(screen.getByTestId("c").textContent).toBe("Welcome to {brand}|Welcome to Explicit|0");
  });

  it("client-only defaults (a BigInt, a tag handler) render and are never serialized", () => {
    const b = <T,>(c: T) => <b>{c as ReactNode}</b>;
    render(
      <I18nProvider
        payload={payload("en", { default: { en: { v: "{v}", r: "<b>bold</b>" } } })}
        options={{ defaultParams: { v: 1n, b } }}
      >
        <Show />
      </I18nProvider>,
    );
    expect(screen.getByTestId("show").innerHTML).toBe("1|<b>bold</b>");
  });

  it("server-handed params merged with a client handler: a later payload changes and clears them, the handler stays", async () => {
    const b = <T,>(c: T) => <b>{c as ReactNode}</b>;
    const cats2 = { default: { en: { v: "{v}", r: "<b>{v}</b>" } } };
    const merged = (server?: Record<string, string>) => (
      <I18nProvider payload={payload("en", cats2)} options={{ defaultParams: { ...server, b } }}>
        <Show />
      </I18nProvider>
    );
    const { rerender } = render(merged({ v: "one" }));
    const show = () => screen.getByTestId("show").innerHTML;
    expect(show()).toBe("one|<b>one</b>");
    await act(async () => rerender(merged({ v: "two" })));
    expect(show()).toBe("two|<b>two</b>");
    await act(async () => rerender(merged()));
    expect(show()).toBe("{v}|<b>{v}</b>");
  });

  it("hydrates the server's text with the server's params: no mismatch", async () => {
    const html = renderToString(tree({ brand: "Comvi" }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.append(el);
    const errors: unknown[] = [];
    await act(async () => {
      hydrateRoot(el, tree({ brand: "Comvi" }), { onRecoverableError: (e) => errors.push(e) });
    });
    expect(errors).toEqual([]);
    expect(el.textContent).toBe("Welcome to Comvi|Welcome to Explicit|0");
  });
});

describe("defaultParams and catalogs of one payload are one snapshot (owner probe 2026-11-10)", () => {
  const captured: string[] = [];
  function Draft() {
    const { t } = useI18n();
    const [draft] = useState(() => t("welcome") as string);
    captured.push(draft);
    return <p data-testid="draft">{draft}</p>;
  }
  const tree = (
    welcome: string,
    defaultParams: Record<string, string> | undefined,
    draft: boolean,
  ) => (
    <I18nProvider
      payload={payload("en", { default: { en: { welcome } } })}
      options={defaultParams && { defaultParams }}
    >
      {draft && <Draft />}
    </I18nProvider>
  );

  it("a component mounted with a payload that changes a param captures the new text with the new param", async () => {
    captured.length = 0;
    const { rerender } = render(tree("Welcome to {brand}", { brand: "A" }, false));
    await act(async () => rerender(tree("Hello from {brand}", { brand: "B" }, true)));
    expect(captured[0]).toBe("Hello from B");
    expect(screen.getByTestId("draft").textContent).toBe("Hello from B");
  });

  it("the same with the params cleared", async () => {
    captured.length = 0;
    const { rerender } = render(tree("Welcome to {brand}", { brand: "A" }, false));
    await act(async () => rerender(tree("Hello from {brand}", undefined, true)));
    expect(captured[0]).toBe("Hello from {brand}");
  });
});

describe("hydration with a `null` slot through the provider (the ordinary readiness template)", () => {
  const branch = ({ t, isReady, isLoading }: ReturnType<typeof useI18n>) =>
    isReady ? <p>{t("title")}</p> : isLoading ? <i>loading</i> : <b>unavailable</b>;
  const TplDefault = () => branch(useI18n());
  const TplNs = ({ ns }: { ns: string }) => branch(useI18n(ns));

  // Pinning: the browser instance is created from the payload, so the server HTML of the Client
  // Component and the hydration render read the same failed pair.
  it.each([
    ["useI18n()", "default", undefined],
    ["useI18n(ns)", "admin", "admin"],
  ])(
    "%s, no catalog at all, a client loader: same branch, no warning, no request",
    async (_, ns, arg) => {
      // The layout's `default` is in the payload too, so nothing loads at creation.
      const p = payload("uk", { default: { uk: {}, en: {} }, [ns]: { uk: null, en: null } });
      const loader = vi.fn(async () => ({ title: "x" }));
      const ui = () => (
        <I18nProvider payload={p} options={{ fallbackLocale: "en", loader, onError: () => {} }}>
          {arg ? <TplNs ns={arg} /> : <TplDefault />}
        </I18nProvider>
      );
      const html = renderToString(ui());
      expect(html).toBe("<b>unavailable</b>");
      const el = document.createElement("div");
      el.innerHTML = html;
      document.body.append(el);
      const errors: unknown[] = [];
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      let root: { unmount(): void } | undefined;
      await act(async () => {
        root = hydrateRoot(el, ui(), { onRecoverableError: (e) => errors.push(e) });
      });
      await act(async () => {});
      expect(errors).toEqual([]);
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
      expect(el.innerHTML).toBe("<b>unavailable</b>");
      expect(loader).not.toHaveBeenCalled();
      root!.unmount();
      el.remove();
    },
  );
});
