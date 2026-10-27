/**
 * useI18n(ns?) (design §3.4). Ported by meaning from 0.7 useI18n.test.tsx: reactive state
 * from the provider, a namespace-bound t(), t() rebuilt on a locale change, stable method
 * references, rtl direction, setLocale proxied, a new instance's methods. Gone with the
 * 0.7 surface: tRaw, hasTranslation, the formatters (→ @comvi/react/format), on/addMessages
 * /reportError proxies (the instance is `i18n`), cacheRevision/isInitialized.
 */
import { Children, StrictMode, useEffect, useState, type ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createI18n, I18nProvider, useI18n, type I18n, type UseI18n } from "../src";
import { make, manualLoader, reactWarnings, settle } from "./helpers";

const capture = (i18n: I18n, ns?: string) => {
  const seen: UseI18n<string>[] = [];
  const Probe = () => {
    seen.push(useI18n(ns));
    return null;
  };
  const view = render(
    <I18nProvider i18n={i18n}>
      <Probe />
    </I18nProvider>,
  );
  return { seen, view, last: () => seen[seen.length - 1] };
};

describe("useI18n()", () => {
  it("returns t, locale, dir, isLoading, setLocale and the instance", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hi {name}" } } });
    const { last } = capture(i18n);
    expect(Object.keys(last()).sort()).toEqual(
      ["T", "dir", "i18n", "isLoading", "locale", "setLocale", "t"].sort(),
    );
    expect(last().t("hi", { name: "Ann" })).toBe("Hi Ann");
    expect(last().locale).toBe("en");
    expect(last().dir).toBe("ltr");
    expect(last().isLoading).toBe(false);
    expect(last().i18n).toBe(i18n);
    expect(last().setLocale).toBe(i18n.setLocale);
  });

  it("rebuilds t on a locale change, so a memoized consumer re-translates", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hi" }, de: { hi: "Hallo" } } });
    const texts: string[] = [];
    const Memo = () => {
      const { t } = useI18n();
      const [text, set] = useState("");
      useEffect(() => set(t("hi") as string), [t]);
      texts.push(text);
      return null;
    };
    render(
      <I18nProvider i18n={i18n}>
        <Memo />
      </I18nProvider>,
    );
    await act(() => i18n.setLocale("de"));
    expect(texts.at(-1)).toBe("Hallo");
  });

  it("keeps t's identity across renders that publish nothing", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hi" } } });
    let bump!: () => void;
    const ts: unknown[] = [];
    const Probe = () => {
      const [n, set] = useState(0);
      bump = () => set(n + 1);
      ts.push(useI18n().t);
      return null;
    };
    render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    act(() => bump());
    act(() => bump());
    expect(new Set(ts).size).toBe(1);
  });

  it("reports rtl for a right-to-left locale", () => {
    const i18n = createI18n({ locale: "ar-EG", messages: { "ar-EG": { hi: "مرحبا" } } });
    expect(capture(i18n).last().dir).toBe("rtl");
  });

  it("per-call { ns } and { locale } reach the core (R3-1)", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: {
        default: { en: { hi: "Hi" }, de: { hi: "Hallo" } },
        shop: { en: { hi: "Shop hi" } },
      },
    });
    const { t } = capture(i18n).last();
    expect(t("hi", { ns: "shop" })).toBe("Shop hi");
    expect(t("hi", { locale: "de" })).toBe("Hallo");
  });
});

describe("useI18n(ns)", () => {
  it("binds t to the namespace", () => {
    const i18n = createI18n({ locale: "en", catalogs: { admin: { en: { title: "Dashboard" } } } });
    expect(capture(i18n, "admin").last().t("title")).toBe("Dashboard");
  });

  it("activates the namespace after commit, never during render", async () => {
    const l = manualLoader({ "en:shop": { title: "Shop" } });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const requestedInRender: string[][] = [];
    const Probe = () => {
      const { t, isLoading } = useI18n("shop");
      requestedInRender.push([...l.requested]);
      return <p>{`${String(isLoading)}:${t("title") as string}`}</p>;
    };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(requestedInRender[0]).toEqual([]);
    expect(l.requested).toEqual(["en:shop"]);
    expect(container.textContent).toBe("true:title");
    await l.answer("en:shop");
    expect(container.textContent).toBe("false:Shop");
  });

  it("isLoading is per namespace and covers a switch in flight", async () => {
    const l = manualLoader({ "de:default": { hi: "Hallo" }, "de:shop": {} });
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: { hi: "Hi" } }, shop: { en: {} } },
      namespaces: ["default", "shop"],
      loader: l.load,
    });
    const flags: string[] = [];
    const Probe = () => {
      const a = useI18n().isLoading;
      const b = useI18n("shop").isLoading;
      flags.push(`${a}/${b}`);
      return null;
    };
    render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(flags.at(-1)).toBe("false/false");
    let p!: Promise<void>;
    act(() => void (p = i18n.setLocale("de")));
    expect(flags.at(-1)).toBe("true/true");
    await l.answer("de:default");
    expect(flags.at(-1)).toBe("false/true");
    await l.answer("de:shop");
    await act(() => p);
    expect(flags.at(-1)).toBe("false/false");
  });

  it("a remount after a failed load does not fetch it again; i18n.load(ns) retries", async () => {
    const l = manualLoader({ "en:shop": { title: "Shop" } });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Shop = () => <p>{useI18n("shop").t("title") as string}</p>;
    let flip!: () => void;
    const List = () => {
      const [k, set] = useState(0);
      flip = () => set(k + 1);
      return <Shop key={k} />;
    };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <List />
      </I18nProvider>,
    );
    await l.fail("en:shop");
    act(() => flip());
    act(() => flip());
    await settle();
    expect(l.requested).toEqual(["en:shop"]);
    act(() => void i18n.load("shop"));
    await l.answer("en:shop");
    expect(l.requested).toEqual(["en:shop", "en:shop"]);
    expect(container.textContent).toBe("Shop");
  });

  it("default tag handlers get their children as ONE node too (constructor and setDefaultParams)", async () => {
    // Children.only() throws on an array: the handler sees exactly one node.
    const only = (c: ReactNode) => <b>{Children.only(c)}</b>;
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { a: "<x>one <y>two</y></x>" } },
      defaultParams: { x: only, y: only },
    });
    const Probe = () => <div>{useI18n().t("a") as ReactNode}</div>;
    const warnings = await reactWarnings(() => {
      const { container } = render(
        <I18nProvider i18n={i18n}>
          <Probe />
        </I18nProvider>,
      );
      expect(container.innerHTML).toBe("<div><b>one <b>two</b></b></div>");
      act(() => i18n.setDefaultParams({ x: (c: ReactNode) => <i>{Children.only(c)}</i>, y: only }));
      expect(container.innerHTML).toBe("<div><i>one <b>two</b></i></div>");
    });
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("returns a bound <T> per namespace: same component every render, the namespace fixed", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { default: { en: { k: "D" } }, shop: { en: { k: "Shop {n}" } } },
    });
    const Ts = new Set<unknown>();
    let bump!: () => void;
    const Probe = () => {
      const [n, set] = useState(0);
      bump = () => set(n + 1);
      const { T } = useI18n("shop");
      Ts.add(T);
      return <T i18nKey="k" n={n} />;
    };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("Shop 0");
    const node = container.firstChild;
    act(() => bump());
    expect(container.textContent).toBe("Shop 1");
    // A publish rebuilds what useI18n returns; the bound <T> stays the same component,
    // so React keeps its subtree instead of remounting it.
    act(() => i18n.add("en", { k: "Shop {n}!" }, "shop"));
    expect(container.textContent).toBe("Shop 1!");
    expect(container.firstChild).toBe(node);
    expect(Ts.size).toBe(1);
  });

  it("keeps a fixed hook order: switching ns between renders is not a hook-order error", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { a: { en: { k: "A" } }, b: { en: { k: "B" } } },
    });
    let flip!: () => void;
    const Probe = () => {
      const [ns, set] = useState<string | undefined>("a");
      flip = () => set(ns ? undefined : "b");
      return <p>{useI18n(ns).t("k") as string}</p>;
    };
    const { container } = render(
      <StrictMode>
        <I18nProvider i18n={i18n}>
          <Probe />
        </I18nProvider>
      </StrictMode>,
    );
    expect(container.textContent).toBe("A");
    act(() => flip());
    expect(container.textContent).toBe("k");
    act(() => flip());
    expect(container.textContent).toBe("B");
  });
});
