/**
 * `<I18nHandover defaultParams>` (public, owner decision 2026-11-10): one rule. A server can hand
 * over data only, so the prop's strings, numbers, booleans and `null` are the server's params, and
 * any other value on the instance (a tag handler, a BigInt) is the client's.
 *
 * - Not passed: the handover never touches the instance's `defaultParams`.
 * - Passed (`{}` included): the instance's data values become exactly the prop's (a key it lacks
 *   is cleared) whenever they differ from what this handover applied last (the first time: from
 *   the instance's own); the client's values stay unless the prop gives that key.
 */
import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { state } from "@comvi/core/internal";
import { createI18n, I18nHandover, I18nProvider, useI18n, type I18n } from "../src";

const cats = {
  default: { en: { hi: "Welcome to {brand}", r: "<b>{brand}</b>", p: "[{__proto__}]" } },
};
function Show() {
  const { t } = useI18n();
  return (
    <p data-testid="s">
      {t("hi") as string}|{t("r") as ReactNode}|{t("p") as string}
    </p>
  );
}
const tree = (i18n: I18n, dp?: Record<string, unknown>) => (
  <I18nProvider i18n={i18n}>
    <I18nHandover catalogs={cats} defaultParams={dp}>
      <Show />
    </I18nHandover>
  </I18nProvider>
);
const shown = () => screen.getByTestId("s").innerHTML;
const b = (c: unknown) => <b>{c as ReactNode}</b>;
const make = (defaultParams?: Record<string, unknown>) =>
  createI18n({ locale: "en", catalogs: cats, defaultParams, onError: () => {} });

describe("an own `__proto__` key of the handed defaultParams is a param like any other", () => {
  // The instance starts with it (its own copy keeps the key) and the first payload agrees, so
  // each case below is a REPEATED payload.
  const start = () => {
    const i18n = make(JSON.parse('{"__proto__": "one"}'));
    const r = render(tree(i18n, JSON.parse('{"__proto__": "one"}')));
    expect(shown()).toContain("[one]");
    return [i18n, r.rerender] as const;
  };

  it("a repeated payload changes its value", async () => {
    const [i18n, rerender] = start();
    await act(async () => rerender(tree(i18n, JSON.parse('{"__proto__": "two"}'))));
    expect(shown()).toContain("[two]");
    expect(i18n.t("p")).toBe("[two]");
  });

  it("a repeated payload clears it", async () => {
    const [i18n, rerender] = start();
    await act(async () => rerender(tree(i18n, {})));
    expect(shown()).toContain("[{__proto__}]");
    expect(i18n.t("p")).toBe("[{__proto__}]");
  });

  it("a first payload sets it", () => {
    render(tree(make(), JSON.parse('{"__proto__": "one"}')));
    expect(shown()).toContain("[one]");
  });

  it("a `null` value and its clearing (defined with Object.defineProperty)", async () => {
    const own = (v: unknown) =>
      Object.defineProperty({}, "__proto__", { value: v, enumerable: true });
    const i18n = make({ brand: "B" });
    const { rerender } = render(tree(i18n, { brand: "B", ...own("x") }));
    expect(shown()).toContain("[x]");
    // A `null` param renders as its placeholder, so the instance's own copy is read.
    const proto = () => Object.getOwnPropertyDescriptor(state(i18n).dp ?? {}, "__proto__");
    await act(async () => rerender(tree(i18n, { brand: "B", ...own(null) })));
    expect(i18n.t("p")).toBe("[{__proto__}]");
    expect(proto()?.value).toBe(null);
    await act(async () => rerender(tree(i18n, { brand: "B" })));
    expect(proto()).toBeUndefined();
    expect(i18n.t("hi")).toBe("Welcome to B");
  });
});

describe("three cases of the prop, and the client's own values", () => {
  it("not passed: the instance's params, handlers included, are never touched", async () => {
    const i18n = make({ brand: "Client", b });
    const { rerender } = render(tree(i18n));
    expect(shown()).toBe("Welcome to Client|<b>Client</b>|[{__proto__}]");
    i18n.setDefaultParams({ brand: "Later", b });
    await act(async () => rerender(tree(i18n)));
    expect(shown()).toBe("Welcome to Later|<b>Later</b>|[{__proto__}]");
  });

  it("an empty object: the server hands none, so the instance's data values are cleared; its handler stays", async () => {
    const i18n = make({ brand: "Client", b });
    render(tree(i18n, {}));
    expect(shown()).toBe("Welcome to {brand}|<b>{brand}</b>|[{__proto__}]");
    await act(async () => {});
    expect(i18n.t("hi")).toBe("Welcome to {brand}");
    expect(shown()).toBe("Welcome to {brand}|<b>{brand}</b>|[{__proto__}]");
  });

  it("an empty object over an instance with no data values changes nothing", async () => {
    const i18n = make({ b });
    render(tree(i18n, {}));
    await act(async () => {});
    expect(shown()).toBe("Welcome to {brand}|<b>{brand}</b>|[{__proto__}]");
  });

  it("new values: they replace the server's (a key the payload lacks is cleared); a handler the client created the instance with stays", async () => {
    const i18n = make({ brand: "One", b });
    const { rerender } = render(tree(i18n, { brand: "One" }));
    expect(shown()).toBe("Welcome to One|<b>One</b>|[{__proto__}]");
    await act(async () => rerender(tree(i18n, { brand: "Two" })));
    expect(shown()).toBe("Welcome to Two|<b>Two</b>|[{__proto__}]");
    expect(i18n.t("hi")).toBe("Welcome to Two");
    await act(async () => rerender(tree(i18n, {})));
    expect(shown()).toBe("Welcome to {brand}|<b>{brand}</b>|[{__proto__}]");
  });

  it("a handler the client set later through setDefaultParams() stays across payloads that change the server's values", async () => {
    const i18n = make({ brand: "One" });
    const { rerender } = render(tree(i18n, { brand: "One" }));
    await act(async () => i18n.setDefaultParams({ brand: "One", b }));
    await act(async () => rerender(tree(i18n, { brand: "Two" })));
    expect(shown()).toBe("Welcome to Two|<b>Two</b>|[{__proto__}]");
  });

  it("a handler given in the prop wins over the instance's for that key", async () => {
    const i18n = make({ brand: "One", b });
    const i = (c: unknown) => <i>{c as ReactNode}</i>;
    render(tree(i18n, { brand: "Two", b: i }));
    expect(shown()).toBe("Welcome to Two|<i>Two</i>|[{__proto__}]");
    await act(async () => {});
    expect(shown()).toBe("Welcome to Two|<i>Two</i>|[{__proto__}]");
  });
});
