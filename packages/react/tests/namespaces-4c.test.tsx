/**
 * Lot 4c (owner brief 29.10, R3-26) through React components: `useI18n(ns)` reads, loads and
 * holds `ns` from commit to cleanup; `<T>` reads only; `isReady` / `isLoading` from the render
 * snapshot, with no "unavailable" frame before the commit; the first-paint gate on the core's
 * `isReady` (the owner's review of e5a3788d); the key scenario; SSR hydration with a branch on
 * `isReady`. Contract: `.lot1-pending-tests.md` "Lot 4c contract".
 */
import { startTransition, StrictMode, Suspense, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, I18nProvider, T, useI18n, type I18n } from "../src";
import { handover } from "../../core/src/internal";
import { make, manualLoader, settle } from "./helpers";

/** Every render's `isReady/isLoading` of `ns`, and its text. */
const probe = (ns: string, key = "title") => {
  const frames: string[] = [];
  const P = () => {
    const { t, isReady, isLoading } = useI18n(ns);
    frames.push(`${isReady}/${isLoading}`);
    return <p>{isReady ? (t(key) as string) : isLoading ? "…" : "unavailable"}</p>;
  };
  return { P, frames };
};

const app = (i18n: I18n, children: ReactNode, loading?: ReactNode, suspense?: boolean) => (
  <Suspense fallback="suspended">
    <I18nProvider i18n={i18n} loading={loading} suspense={suspense}>
      {children}
    </I18nProvider>
  </Suspense>
);

describe("first-paint gate on the core's isReady (owner's review of e5a3788d, HIGH)", () => {
  it.each([false, true])(
    "a catalog of a locale outside the chain does not open it: the placeholder shows (suspense: %s)",
    async (suspense) => {
      const l = manualLoader();
      const { i18n } = make({
        locale: "uk",
        messages: { en: { title: "Account" } },
        loader: l.load,
      });
      const Title = () => <p>{useI18n().t("title") as string}</p>;
      const { container } = render(app(i18n, <Title />, "loading", suspense));
      expect(container.textContent).toBe(suspense ? "suspended" : "loading");
      await l.answer("uk:default", { title: "Обліковий запис" });
      await settle();
      expect(container.textContent).toBe("Обліковий запис");
    },
  );

  it.each([false, true])(
    "with fallbackLocale: 'en' the English text shows at once (suspense: %s)",
    async (suspense) => {
      const l = manualLoader();
      const { i18n } = make({
        locale: "uk",
        fallbackLocale: "en",
        messages: { en: { title: "Account" } },
        loader: l.load,
      });
      const Title = () => <p>{useI18n().t("title") as string}</p>;
      const { container } = render(app(i18n, <Title />, "loading", suspense));
      expect(container.textContent).toBe("Account");
      await l.answer("uk:default", { title: "Обліковий запис" });
      expect(container.textContent).toBe("Обліковий запис");
    },
  );
});

describe("isReady / isLoading from the render snapshot (brief §2)", () => {
  it("first load: not ready and loading from the first render (before the commit) to the catalog", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P, frames } = probe("shop");
    const Eager = () => <i>{useI18n("eager").t("title") as string}</i>;
    const { container } = render(app(i18n, <P />));
    // A t() reading its namespace before the hold is a declared read: no idle warning.
    render(app(i18n, <Eager />));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(frames[0]).toBe("false/true"); // never a "false/false" frame before the hold
    expect(container.textContent).toBe("…");
    await l.answer("en:shop", { title: "Shop" });
    expect(frames.at(-1)).toBe("true/false");
    expect(container.textContent).toBe("Shop");
    expect(frames).not.toContain("false/false");
  });

  it("a usable catalog while loading: ready and loading; a failed load: neither", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "uk",
      fallbackLocale: "en",
      messages: { en: {} },
      catalogs: { shop: { en: { title: "Shop" } } },
      loader: l.load,
    });
    const { P, frames } = probe("shop");
    const { container } = render(app(i18n, <P />));
    expect(frames[0]).toBe("true/true");
    expect(container.textContent).toBe("Shop");
    await l.fail("uk:shop");
    expect(frames.at(-1)).toBe("true/false");
    // No catalog at all and a failure: the "unavailable" branch, no endless spinner.
    const { i18n: other } = make({ locale: "uk", messages: { uk: {} }, loader: l.load });
    const q = probe("help");
    const r = render(app(other, <q.P />));
    await l.fail("uk:help");
    expect(q.frames.at(-1)).toBe("false/false");
    expect(r.container.textContent).toBe("unavailable");
  });
});

describe("consumers (brief §3)", () => {
  it("two consumers share one flight; unmounting one keeps the namespace active", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    let setN!: (n: number) => void;
    const List = () => {
      const [n, set] = useState(2);
      setN = set;
      return (
        <>
          {Array.from({ length: n }, (_, k) => (
            <P key={k} />
          ))}
        </>
      );
    };
    const { container } = render(app(i18n, <List />));
    expect(l.requested).toEqual(["en:shop"]);
    await l.answer("en:shop", { title: "Shop" });
    act(() => setN(1));
    let sw!: Promise<void>;
    act(() => void (sw = i18n.setLocale("de")));
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]);
    await l.answer("de:default");
    await l.answer("de:shop", { title: "Laden" });
    await act(() => sw);
    expect(container.textContent).toBe("Laden");
  });

  it("the last consumer unmounting keeps the cache; the next switch does not load it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    let show!: (b: boolean) => void;
    const Page = () => {
      const [on, set] = useState(true);
      show = set;
      return on ? <P /> : null;
    };
    const { container } = render(app(i18n, <Page />));
    await l.answer("en:shop", { title: "Shop" });
    act(() => show(false));
    let sw!: Promise<void>;
    act(() => void (sw = i18n.setLocale("de")));
    await l.answer("de:default");
    await act(() => sw);
    expect(l.requested).toEqual(["en:shop", "de:default"]);
    // Cached for its own locale: switching back renders it with no request.
    await act(() => i18n.setLocale("en"));
    act(() => show(true));
    expect(container.textContent).toBe("Shop");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
  });

  it("Strict Mode (setup, cleanup, setup): held once while mounted, released at unmount", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <StrictMode>
          <I18nProvider i18n={i18n}>
            <P />
          </I18nProvider>
        </StrictMode>,
      ),
    );
    expect(l.requested).toEqual(["en:shop"]); // one flight for the two setups
    await l.answer("en:shop");
    let sw!: Promise<void>;
    act(() => void (sw = i18n.setLocale("de")));
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]); // still held
    await l.answer("de:default");
    await l.answer("de:shop");
    await act(() => sw);
    act(() => root.unmount());
    const back = i18n.setLocale("fr");
    expect(l.requested.slice(3)).toEqual(["fr:default"]); // released: shop not loaded
    await l.answer("fr:default");
    await back;
  });

  it("a render React abandons holds nothing and requests nothing", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P, frames } = probe("shop");
    const Suspends = (): never => {
      throw new Promise(() => {});
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () =>
      startTransition(() =>
        root.render(
          <I18nProvider i18n={i18n}>
            <P />
            <Suspends />
          </I18nProvider>,
        ),
      ),
    );
    expect(container.textContent).toBe("");
    expect(frames.length).toBeGreaterThan(0); // it rendered
    expect(l.requested).toEqual([]);
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["de:default"]);
    await l.answer("de:default");
    await sw;
    act(() => root.unmount());
  });

  it("a change of ns releases the old namespace and holds the new one", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    let setNs!: (n: string) => void;
    const P = () => {
      const [ns, set] = useState("a");
      setNs = set;
      return <p>{useI18n(ns).t("title") as string}</p>;
    };
    render(app(i18n, <P />));
    await l.answer("en:a");
    act(() => setNs("b"));
    await l.answer("en:b");
    let sw!: Promise<void>;
    act(() => void (sw = i18n.setLocale("de")));
    expect(l.requested).toEqual(["en:a", "en:b", "de:default", "de:b"]);
    await l.answer("de:default");
    await l.answer("de:b");
    await act(() => sw);
  });
});

describe("reading never loads (brief §1)", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  afterEach(() => warn?.mockRestore());

  it("<T ns> renders what is there and requests nothing; development warns once", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { container } = render(
      app(
        i18n,
        <>
          <T i18nKey="title" ns="account" />
          <T i18nKey="other" ns="account" />
        </>,
      ),
    );
    await settle();
    expect(l.requested).toEqual([]);
    expect(container.textContent).toBe("titleother");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"account"');
  });

  it("useI18n(ns).T reads the namespace its useI18n holds: loaded once, no warning", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Child = ({ T: B }: { T: ReturnType<typeof useI18n<"account">>["T"] }) => (
      <B i18nKey="title" />
    );
    const Page = () => {
      const { T: B } = useI18n("account");
      return <Child T={B} />;
    };
    const { container } = render(app(i18n, <Page />));
    expect(l.requested).toEqual(["en:account"]);
    await l.answer("en:account", { title: "Account" });
    expect(container.textContent).toBe("Account");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("setLocale() and the active need (brief §4, §7)", () => {
  it("the key scenario: account → default page → switch: only default loads; back on account: loading, then the text", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    await l.answer("en:default", { home: "Home" });
    const account = probe("account");
    const Home = () => <p>{useI18n().t("home") as string}</p>;
    let go!: (p: string) => void;
    const Router = () => {
      const [page, set] = useState("account");
      go = set;
      return page == "account" ? <account.P /> : <Home />;
    };
    const { container } = render(app(i18n, <Router />));
    await l.answer("en:account", { title: "Account" });
    expect(container.textContent).toBe("Account");
    act(() => go("home"));
    let sw!: Promise<void>;
    act(() => void (sw = i18n.setLocale("de")));
    await l.answer("de:default", { home: "Start" });
    await act(() => sw);
    expect(container.textContent).toBe("Start");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default"]);
    account.frames.length = 0;
    act(() => go("account"));
    expect(account.frames[0]).toBe("false/true");
    expect(container.textContent).toBe("…");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default", "de:account"]);
    await l.answer("de:account", { title: "Konto" });
    expect(container.textContent).toBe("Konto");
    expect(account.frames).not.toContain("false/false");
  });

  it("a consumer mounted while a switch is pending ends with the applied locale's catalog", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    let show!: () => void;
    const Page = () => {
      const [on, set] = useState(false);
      show = () => set(true);
      return on ? <P /> : null;
    };
    const { container } = render(app(i18n, <Page />));
    let sw!: Promise<void>;
    act(() => void (sw = i18n.setLocale("de")));
    act(() => show());
    expect(l.requested).toEqual(["de:default", "en:shop"]);
    await l.answer("de:default");
    await act(() => sw);
    expect(l.requested).toEqual(["de:default", "en:shop", "de:shop"]);
    await l.answer("de:shop", { title: "Laden" });
    expect(container.textContent).toBe("Laden");
  });
});

describe("SSR hydration with a branch on isReady (brief §5)", () => {
  const Account = () => {
    const { t, isReady, isLoading } = useI18n("account");
    return <p>{isReady ? (t("title") as string) : isLoading ? "loading" : "unavailable"}</p>;
  };
  /** The browser instance: the app's options (the same `fallbackLocale`) + the payload. */
  const hydrate = async (server: I18n, options: { fallbackLocale?: string } = {}) => {
    const html = renderToString(app(server, <Account />));
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const container = document.createElement("div");
    container.innerHTML = html;
    const l = manualLoader();
    const { i18n } = make({ locale: "en", ...options, loader: l.load, ...payload });
    const recoverable: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, app(i18n, <Account />), {
        onRecoverableError: (e) => recoverable.push(e),
      });
    });
    const hydrated = container.textContent;
    await settle();
    const errors = [...recoverable, ...err.mock.calls];
    err.mockRestore();
    return { html, hydrated, errors, l, container, root, i18n };
  };

  it("preloaded on the server (load()): the same text branch, 0 requests, the handover kept", async () => {
    const server = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: {} },
      loader: async () => ({ title: "Account" }),
    });
    await server.load("account");
    const h = await hydrate(server);
    expect(h.html).toContain("Account");
    expect([h.hydrated, h.errors, h.l.requested]).toEqual(["Account", [], []]);
    act(() => h.root.unmount()); // the consumer is released: the cache stays
    expect(h.i18n.t("title", { ns: "account" })).toBe("Account");
  });

  it("failed on the server, no usable catalog: the same 'unavailable' branch, 0 requests", async () => {
    const server = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: {} },
      onError: () => {},
      loader: async () => {
        throw new Error("404");
      },
    });
    await server.load("account").catch(() => {});
    const h = await hydrate(server);
    expect(h.html).toContain("unavailable");
    expect([h.hydrated, h.errors, h.l.requested]).toEqual(["unavailable", [], []]);
    act(() => h.root.unmount());
  });

  it("served through the fallback locale: the same text branch, 0 requests", async () => {
    const server = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      messages: { uk: {} },
      onError: () => {},
      loader: async (l) => {
        if (l == "uk") throw new Error("404");
        return { title: "Account" };
      },
    });
    await server.load("account").catch(() => {});
    const h = await hydrate(server, { fallbackLocale: "en" });
    expect([h.hydrated, h.errors, h.l.requested]).toEqual(["Account", [], []]);
    act(() => h.root.unmount());
  });

  it("not preloaded: the server and the hydration both render 'loading'; then the browser loads it", async () => {
    const server = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: {} },
      loader: () => new Promise(() => {}),
    });
    const h = await hydrate(server);
    expect([h.hydrated, h.errors]).toEqual(["loading", []]);
    expect(h.l.requested).toEqual(["en:account"]);
    await h.l.answer("en:account", { title: "Account" });
    expect(h.container.textContent).toBe("Account");
    act(() => h.root.unmount());
  });
});
