/**
 * `<I18nHandover defaultParams>` (public; owner decisions 2026-11-10/11): server DATA only
 * (strings, finite numbers, booleans, `null`; anything else is a TypeError naming the key);
 * - not passed: the instance's `defaultParams` are not changed;
 * - passed: the object REPLACES the whole set (`{}` clears it), what the client set included;
 *   rendered at once, set at commit, no remount;
 * - the same OBJECT again is a no-op (changes the client made since stay); a new object that
 *   differs from the instance's CURRENT set (own keys, `Object.is`) replaces it, and one equal
 *   to it publishes nothing; explicit `t()` params win. Own keys only; an own `__proto__` key
 *   is a param like any other.
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
  type HandoverParams,
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
const tree = (i18n: I18n, dp?: HandoverParams, catalogs: HandoverCatalogs = cats) => (
  <I18nProvider i18n={i18n}>
    <I18nHandover catalogs={catalogs} defaultParams={dp}>
      <Show />
    </I18nHandover>
  </I18nProvider>
);
const shown = () => screen.getByTestId("s").innerHTML;
const b = (c: unknown) => <b>{c as ReactNode}</b>;
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

  it("a repeated payload replaces, removes a key it lacks, and `{}` clears", async () => {
    const i18n = make({ brand: "One", n: 1, b });
    const { rerender } = render(tree(i18n, { brand: "One", n: 1 }));
    // The first payload's set replaces the instance's: its handler is gone.
    expect(shown()).toBe("Welcome to One|One|[{__proto__}]|0");
    await act(async () => rerender(tree(i18n, { brand: "Two", n: 2 })));
    expect(shown()).toBe("Welcome to Two|Two|[{__proto__}]|0");
    expect(state(i18n).dp).toEqual({ brand: "Two", n: 2 });
    await act(async () => rerender(tree(i18n, { brand: "Two" })));
    expect(state(i18n).dp).toEqual({ brand: "Two" });
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
    const ui = (dp: HandoverParams, locale: string, mount: boolean) => (
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

describe("3. the same payload vs a new one", () => {
  it("a rerender with the SAME set object keeps what the client set since (pinning)", async () => {
    const i18n = make({ brand: "One" });
    const set = { brand: "One" };
    const { rerender } = render(tree(i18n, set));
    await act(async () => i18n.setDefaultParams({ brand: "Client", b }));
    await act(async () => rerender(tree(i18n, set)));
    expect(shown()).toBe("Welcome to Client|<b>Client</b>|[{__proto__}]|0");
  });

  it("a NEW payload whose values equal the earlier server set overwrites the client's change", async () => {
    const i18n = make({ brand: "One" });
    const { rerender } = render(tree(i18n, { brand: "One" }));
    await act(async () => i18n.setDefaultParams({ brand: "Client", b }));
    await act(async () => rerender(tree(i18n, { brand: "One" })));
    expect(shown()).toBe("Welcome to One|One|[{__proto__}]|0");
    expect(state(i18n).dp).toEqual({ brand: "One" });
  });

  it("a new object equal to the instance's current set publishes nothing", async () => {
    const i18n = make({ brand: "One" });
    const { rerender } = render(tree(i18n, { brand: "One" }));
    await act(async () => {});
    const rev = i18n.rev();
    await act(async () => rerender(tree(i18n, { brand: "One" })));
    expect(i18n.rev()).toBe(rev);
  });

  it("an inline set in a component that reads useI18n() settles: bounded renders, one publication", async () => {
    const i18n = make();
    let renders = 0;
    const published: number[] = [];
    i18n.on(() => published.push(i18n.rev()));
    function Page() {
      useI18n();
      // A guard so a loop fails fast instead of hanging the suite.
      if (++renders > 50) throw new Error("looped");
      return (
        <I18nHandover catalogs={cats} defaultParams={{ brand: "Comvi" }}>
          <Show />
        </I18nHandover>
      );
    }
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <I18nProvider i18n={i18n}>
          <Page />
        </I18nProvider>,
      );
      await act(async () => {});
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
    expect(shown()).toBe("Welcome to Comvi|Comvi|[{__proto__}]|0");
    expect(renders).toBeLessThanOrEqual(3);
    expect(published.length).toBe(1);
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
  it("an explicit t() param wins over the set in the pending render too (pinning)", async () => {
    const i18n = make({ brand: "One" });
    const seenHere: string[] = [];
    function Explicit() {
      const { t } = useI18n();
      seenHere.push(`${t("hi") as string}|${t("hi", { brand: "Explicit" }) as string}`);
      return null;
    }
    const ui = (dp: HandoverParams) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover catalogs={cats} defaultParams={dp}>
          <Explicit />
        </I18nHandover>
      </I18nProvider>
    );
    const { rerender } = render(ui({ brand: "One" }));
    seenHere.length = 0;
    await act(async () => rerender(ui({ brand: "Two" })));
    // The first render with the new set runs before its commit.
    expect(seenHere[0]).toBe("Welcome to Two|Welcome to Explicit");
    expect(seenHere.every((x) => x.endsWith("|Welcome to Explicit"))).toBe(true);
  });

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
    render(tree(i18n, Object.create({ brand: "Inherited" }) as HandoverParams));
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

describe("6. server data only (owner decision 2026-11-11)", () => {
  // The former loop: an inline handler re-created per render in a component that reads
  // useI18n(). The prop takes strings, finite numbers, booleans and `null` only.
  const run = (dp: () => Record<string, unknown>) => {
    const i18n = make();
    let renders = 0;
    function Page() {
      useI18n();
      // A guard so a loop fails fast instead of hanging the suite.
      if (++renders > 50) throw new Error("looped");
      return (
        <I18nHandover catalogs={cats} defaultParams={dp() as HandoverParams}>
          <Show />
        </I18nHandover>
      );
    }
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <I18nProvider i18n={i18n}>
          <Page />
        </I18nProvider>,
      );
      return "rendered";
    } catch (e) {
      return String(e);
    } finally {
      err.mockRestore();
    }
  };
  it.each([
    ["a handler", () => ({ b: (c: unknown) => <b>{c as ReactNode}</b> })],
    ["a Date", () => ({ d: new Date(0) })],
    ["an array", () => ({ d: ["a"] })],
    ["a nested object", () => ({ d: { a: 1 } })],
    ["NaN", () => ({ d: NaN })],
    ["undefined", () => ({ d: undefined })],
  ])("%s throws a clear TypeError naming the key, no loop", (_, dp) => {
    const out = run(dp);
    expect(out).toMatch(
      /^TypeError: .*defaultParams\.[bd] .*strings, finite numbers, booleans and null/,
    );
  });

  it("only own keys are checked: an inherited handler is not read (pinning)", () => {
    expect(run(() => Object.create({ b: () => 1 }) as Record<string, unknown>)).toBe("rendered");
  });

  it("strings, finite numbers, booleans and null pass (pinning)", () => {
    expect(run(() => ({ brand: "Comvi", n: 1.5, ok: false, none: null }))).toBe("rendered");
  });
});

describe("7. two stable handovers on one instance (owner 2026-11-11)", () => {
  // Each set is applied once per object at its handover's commit; there is one set per
  // instance, so the handover committed last wins (an inner one commits before its outer one,
  // siblings in tree order). Separate defaults per subtree need separate instances.
  const outer = { brand: "Outer" };
  const inner = { brand: "Inner" };
  const left = { brand: "Left" };
  const right = { brand: "Right" };
  const count = (i18n: I18n) => {
    const pubs: number[] = [];
    i18n.on(() => pubs.push(i18n.rev()));
    return pubs;
  };

  it("nested: settles after one publication each, the outer set wins", async () => {
    const i18n = make();
    const pubs = count(i18n);
    let renders = 0;
    function Read() {
      renders++;
      return <p data-testid="n">{useI18n().t("hi") as string}</p>;
    }
    render(
      <I18nProvider i18n={i18n}>
        <I18nHandover defaultParams={outer}>
          <I18nHandover defaultParams={inner}>
            <Read />
          </I18nHandover>
        </I18nHandover>
      </I18nProvider>,
    );
    await act(async () => {});
    expect(pubs.length).toBe(2);
    expect(renders).toBeLessThanOrEqual(4);
    expect(state(i18n).dp).toEqual({ brand: "Outer" });
    expect(screen.getByTestId("n").textContent).toBe("Welcome to Outer");
  });

  it("siblings: settle after one publication each, the later sibling wins", async () => {
    const i18n = make();
    const pubs = count(i18n);
    const Read = ({ id }: { id: string }) => <p data-testid={id}>{useI18n().t("hi") as string}</p>;
    render(
      <I18nProvider i18n={i18n}>
        <I18nHandover defaultParams={left}>
          <Read id="l" />
        </I18nHandover>
        <I18nHandover defaultParams={right}>
          <Read id="r" />
        </I18nHandover>
      </I18nProvider>,
    );
    await act(async () => {});
    expect(pubs.length).toBe(2);
    expect(state(i18n).dp).toEqual({ brand: "Right" });
    expect(screen.getByTestId("l").textContent).toBe("Welcome to Right");
    expect(screen.getByTestId("r").textContent).toBe("Welcome to Right");
  });
});
