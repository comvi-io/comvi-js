/**
 * `<I18nHandover defaultParams>` (public; owner decision 2026-11-10, the simple contract):
 * - not passed: the instance's `defaultParams` are not changed;
 * - passed: the object REPLACES the whole set (`{}` clears it), values and handlers the client
 *   set included; rendered at once, set at commit, no remount;
 * - a render with the same set (key by key, `Object.is`) re-applies nothing, so changes the
 *   client made since stay; explicit `t()` params win. Own keys only; an own `__proto__` key is
 *   a param like any other.
 */
import { useState, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { state } from "@comvi/core/internal";
import {
  createI18n,
  I18nHandover,
  I18nProvider,
  useI18n,
  type HandoverCatalogs,
  type I18n,
} from "../src";

const cats = {
  default: {
    en: { hi: "Welcome to {brand}", r: "<b>{brand}</b>", p: "[{__proto__}]" },
    uk: { hi: "Вітаємо в {brand}", r: "<b>{brand}</b>", p: "[{__proto__}]" },
  },
};
function Show() {
  const { t } = useI18n();
  const [n, setN] = useState(0);
  return (
    <p data-testid="s" onClick={() => setN(n + 1)}>
      {t("hi") as string}|{t("r") as ReactNode}|{t("p") as string}|{n}
    </p>
  );
}
const tree = (i18n: I18n, dp?: Record<string, unknown>, catalogs: HandoverCatalogs = cats) => (
  <I18nProvider i18n={i18n}>
    <I18nHandover catalogs={catalogs} defaultParams={dp}>
      <Show />
    </I18nHandover>
  </I18nProvider>
);
const shown = () => screen.getByTestId("s").innerHTML;
const b = (c: unknown) => <b>{c as ReactNode}</b>;
const i = (c: unknown) => <i>{c as ReactNode}</i>;
const make = (defaultParams?: Record<string, unknown>) =>
  createI18n({ locale: "en", catalogs: cats, defaultParams, onError: () => {} });

describe("1. first and repeated payload", () => {
  it("not passed: the instance's set is never changed (pinning)", async () => {
    const i18n = make({ brand: "Client", b });
    const { rerender } = render(tree(i18n));
    expect(shown()).toBe("Welcome to Client|<b>Client</b>|[{__proto__}]|0");
    i18n.setDefaultParams({ brand: "Later", b });
    await act(async () => rerender(tree(i18n)));
    expect(shown()).toBe("Welcome to Later|<b>Later</b>|[{__proto__}]|0");
  });

  it("the first payload replaces the whole set: a handler it lacks is gone", async () => {
    const i18n = make({ brand: "Client", b });
    render(tree(i18n, { brand: "Server" }));
    expect(shown()).toBe("Welcome to Server|Server|[{__proto__}]|0");
    await act(async () => {});
    expect(state(i18n).dp).toEqual({ brand: "Server" });
  });

  it("a repeated payload replaces, removes a key it lacks, and `{}` clears (handlers too)", async () => {
    const i18n = make({ brand: "One", b });
    const { rerender } = render(tree(i18n, { brand: "One", b }));
    expect(shown()).toBe("Welcome to One|<b>One</b>|[{__proto__}]|0");
    await act(async () => rerender(tree(i18n, { brand: "Two", b: i })));
    expect(shown()).toBe("Welcome to Two|<i>Two</i>|[{__proto__}]|0");
    await act(async () => rerender(tree(i18n, { brand: "Two" })));
    expect(shown()).toBe("Welcome to Two|Two|[{__proto__}]|0");
    await act(async () => rerender(tree(i18n, {})));
    expect(shown()).toBe("Welcome to {brand}|{brand}|[{__proto__}]|0");
    expect(state(i18n).dp).toBe(null);
  });

  it("`{}` over an instance with no set changes nothing (pinning)", async () => {
    const i18n = make();
    const rev = i18n.rev();
    render(tree(i18n, {}));
    await act(async () => {});
    expect(i18n.rev()).toBe(rev);
  });
});

describe("2. one snapshot: catalogs, locale and the set", () => {
  it("a component mounted in the commit that brings them reads them already in its render (pinning)", async () => {
    const i18n = make({ brand: "A" });
    const drafts: string[] = [];
    function Draft() {
      const { t, locale } = useI18n();
      const [d] = useState(() => `${locale}|${t("hi") as string}`);
      drafts.push(d);
      return <p data-testid="d">{d}</p>;
    }
    const ui = (dp: Record<string, unknown>, locale: string, mount: boolean) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover
          catalogs={{ default: { uk: { hi: `Привіт, {brand} (${locale})` } } }}
          locale={locale}
          defaultParams={dp}
        >
          {mount && <Draft />}
        </I18nHandover>
      </I18nProvider>
    );
    const { rerender } = render(ui({ brand: "A" }, "en", false));
    await act(async () => rerender(ui({ brand: "B" }, "uk", true)));
    expect(drafts[0]).toBe("uk|Привіт, B (uk)");
    expect(screen.getByTestId("d").textContent).toBe("uk|Привіт, B (uk)");
  });

  it("hydrates the server's text with the server's set, over a client handler the set lacks: no mismatch", async () => {
    const ui = (x: I18n) => tree(x, { brand: "Server" });
    const html = renderToString(ui(make({ brand: "Server" })));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.append(el);
    const errors: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: { unmount(): void } | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(el, ui(make({ brand: "Client", b })), {
          onRecoverableError: (e) => errors.push(e),
        });
      });
      expect(errors).toEqual([]);
      expect(err).not.toHaveBeenCalled();
      expect(el.textContent).toBe("Welcome to Server|Server|[{__proto__}]|0");
    } finally {
      err.mockRestore();
      root?.unmount();
      el.remove();
    }
  });
});

describe("3. the same set vs a new one", () => {
  it("a rerender with the same set (a new object, same values) keeps what the client set since (pinning)", async () => {
    const i18n = make({ brand: "One" });
    const { rerender } = render(tree(i18n, { brand: "One" }));
    await act(async () => i18n.setDefaultParams({ brand: "Client", b }));
    await act(async () => rerender(tree(i18n, { brand: "One" })));
    expect(shown()).toBe("Welcome to Client|<b>Client</b>|[{__proto__}]|0");
  });

  it("a new set replaces the client's values AND handlers", async () => {
    const i18n = make({ brand: "One" });
    const { rerender } = render(tree(i18n, { brand: "One" }));
    await act(async () => i18n.setDefaultParams({ brand: "Client", b }));
    await act(async () => rerender(tree(i18n, { brand: "Two" })));
    expect(shown()).toBe("Welcome to Two|Two|[{__proto__}]|0");
    expect(state(i18n).dp).toEqual({ brand: "Two" });
  });
});

describe("4. explicit params, own `__proto__`", () => {
  it("an explicit t() param wins over the set (pinning)", () => {
    const i18n = make();
    render(tree(i18n, { brand: "Server" }));
    expect(i18n.t("hi", { brand: "Explicit" })).toBe("Welcome to Explicit");
  });

  // The first payload agrees with the instance, so each case is a REPEATED payload.
  const start = () => {
    const i18n = make(JSON.parse('{"__proto__": "one"}'));
    const r = render(tree(i18n, JSON.parse('{"__proto__": "one"}')));
    expect(shown()).toContain("[one]");
    return [i18n, r.rerender] as const;
  };
  it("an own `__proto__` key: a repeated payload changes it", async () => {
    const [i18n, rerender] = start();
    await act(async () => rerender(tree(i18n, JSON.parse('{"__proto__": "two"}'))));
    expect(shown()).toContain("[two]");
    expect(i18n.t("p")).toBe("[two]");
  });
  it("an own `__proto__` key: a repeated payload clears it", async () => {
    const [i18n, rerender] = start();
    await act(async () => rerender(tree(i18n, {})));
    expect(shown()).toContain("[{__proto__}]");
    expect(i18n.t("p")).toBe("[{__proto__}]");
  });
  it("an own `__proto__` key: a first payload sets it", () => {
    render(tree(make(), JSON.parse('{"__proto__": "one"}')));
    expect(shown()).toContain("[one]");
  });
  it("an own `__proto__` key set to `null` (Object.defineProperty), then dropped", async () => {
    const own = (v: unknown) =>
      Object.defineProperty({}, "__proto__", { value: v, enumerable: true });
    const i18n = make({ brand: "B" });
    const { rerender } = render(tree(i18n, { brand: "B", ...own("x") }));
    expect(shown()).toContain("[x]");
    const proto = () => Object.getOwnPropertyDescriptor(state(i18n).dp ?? {}, "__proto__");
    await act(async () => rerender(tree(i18n, { brand: "B", ...own(null) })));
    expect(proto()?.value).toBe(null);
    await act(async () => rerender(tree(i18n, { brand: "B" })));
    expect(proto()).toBeUndefined();
  });
  it("an inherited property is not read (pinning)", async () => {
    const i18n = make({ brand: "B" });
    render(tree(i18n, Object.create({ brand: "Inherited" }) as Record<string, unknown>));
    await act(async () => {});
    expect(shown()).toBe("Welcome to {brand}|{brand}|[{__proto__}]|0");
  });
});

describe("5. no remount", () => {
  it("a new set keeps the subtree's state (pinning)", async () => {
    const i18n = make({ brand: "One" });
    const { rerender } = render(tree(i18n, { brand: "One" }));
    fireEvent.click(screen.getByTestId("s"));
    await act(async () => rerender(tree(i18n, { brand: "Two" })));
    expect(shown()).toBe("Welcome to Two|Two|[{__proto__}]|1");
  });
});
