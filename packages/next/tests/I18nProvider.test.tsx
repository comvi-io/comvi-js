/**
 * `<I18nProvider payload>` of `@comvi/next/client` (lot 6a, brief §3, C2): the instance is
 * created once from `{ ...options, ...payload }` (data → instance → gate → content), a failed
 * slot stays failed, and a later payload of the same mount reaches the instance through
 * `<I18nHandover>`.
 */
import { useState } from "react";
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
