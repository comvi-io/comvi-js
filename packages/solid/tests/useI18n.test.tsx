/**
 * `useI18n()`: its members; one subscription per provider; `locale`, `dir` and the rest as
 * accessors that an effect tracks. `locale` and `dir` are slices: a namespace load re-runs
 * nothing that reads only them (as React's useLocale, Vue's computed).
 */
import { createEffect, createMemo, createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nProvider, useI18n, type I18n, type UseI18n } from "../src";
import { make, manualLoader, tick } from "./helpers";

/** What `useI18n(ns)` returned inside a provider of `i18n`, and its text. */
const capture = (i18n: I18n, ns?: string) => {
  let u!: UseI18n<string>;
  const C = () => {
    u = useI18n(ns);
    return <p>{u.t("hi", { name: "Ann" }) as string}</p>;
  };
  const r = render(() => (
    <I18nProvider i18n={i18n}>
      <C />
    </I18nProvider>
  ));
  return { u, ...r };
};

const messages = {
  en: { hi: "Hello, {name}!", items: "{n, plural, one {# item} other {# items}}" },
  de: { hi: "Hallo, {name}!" },
  ar: { hi: "مرحبا {name}" },
};

describe("useI18n()", () => {
  it("returns exactly the members of design §3.4, accessors for the state", () => {
    const { i18n } = make({ locale: "en", messages });
    const { u } = capture(i18n);
    expect(Object.keys(u).sort()).toEqual(
      ["T", "dir", "i18n", "isLoading", "isReady", "locale", "setLocale", "t"].sort(),
    );
    expect(u.locale()).toBe("en");
    expect(u.dir()).toBe("ltr");
    expect(u.isReady()).toBe(true);
    expect(u.isLoading()).toBe(false);
    expect(u.i18n).toBe(i18n);
    expect(u.setLocale).toBe(i18n.setLocale);
    expect(u.t("items", { n: 2 })).toBe("2 items");
  });

  it("t(), locale and dir follow a switch; the text re-renders in place", async () => {
    const { i18n } = make({ locale: "en", messages, fallbackLocale: "en" });
    const { u, container } = capture(i18n);
    const p = container.querySelector("p");
    await u.setLocale("de");
    expect(container.textContent).toBe("Hallo, Ann!");
    expect(container.querySelector("p")).toBe(p);
    await u.setLocale("ar");
    expect(u.dir()).toBe("rtl");
    expect(u.locale()).toBe("ar");
  });

  it("a memo over t() re-runs on a switch", async () => {
    const { i18n } = make({ locale: "en", messages });
    let upper!: () => string;
    const C = () => {
      const { t } = useI18n();
      upper = createMemo(() => t("hi", { name: "Ann" }).toUpperCase());
      return null;
    };
    render(() => (
      <I18nProvider i18n={i18n}>
        <C />
      </I18nProvider>
    ));
    expect(upper()).toBe("HELLO, ANN!");
    await i18n.setLocale("de");
    expect(upper()).toBe("HALLO, ANN!");
  });

  it("re-runs what reads locale or dir on a locale change only: a namespace load does not (counted)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    let locales = 0;
    let dirs = 0;
    let texts = 0;
    const C = () => {
      const { locale, dir, t } = useI18n();
      createEffect(() => (locale(), locales++));
      createEffect(() => (dir(), dirs++));
      createEffect(() => (t("x"), texts++));
      return null;
    };
    render(() => (
      <I18nProvider i18n={i18n}>
        <C />
      </I18nProvider>
    ));
    expect([locales, dirs, texts]).toEqual([1, 1, 1]);
    void i18n.load("shop");
    await l.answer("en:shop");
    expect([locales, dirs]).toEqual([1, 1]);
    expect(texts).toBeGreaterThan(1); // t() reads the whole state (the compromise of §2.5)
    const sw = i18n.setLocale("de");
    await l.answer("de:default");
    await sw;
    expect(locales).toBe(2);
    expect(dirs).toBe(1); // de is ltr too
  });

  it("the bound T is one component per namespace, for every caller", () => {
    const { i18n } = make({ locale: "en", messages });
    let a!: unknown, b!: unknown, c!: unknown;
    const C = () => {
      a = useI18n("shop").T;
      b = useI18n("shop").T;
      c = useI18n("constructor").T;
      return null;
    };
    render(() => (
      <I18nProvider i18n={i18n}>
        <C />
      </I18nProvider>
    ));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(typeof c).toBe("function");
  });

  it("a signal read inside t's params re-renders: params are reactive", () => {
    const { i18n } = make({ locale: "en", messages });
    const [name, setName] = createSignal("Ann");
    const C = () => <p>{useI18n().t("hi", { name: name() }) as string}</p>;
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <C />
      </I18nProvider>
    ));
    setName("Bob");
    expect(container.textContent).toBe("Hello, Bob!");
  });

  it("a rich t() renders real nodes; a parameter is text, never markup", () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "Read <link>the {what}</link>." } },
    });
    const C = () => (
      <p>{useI18n().t("m", { what: "<b>terms</b>", link: (c) => <a href="/t">{c}</a> })}</p>
    );
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <C />
      </I18nProvider>
    ));
    expect(container.innerHTML).toBe('<p>Read <a href="/t">the &lt;b&gt;terms&lt;/b&gt;</a>.</p>');
  });

  it("outside a provider it throws a readable error in development", () => {
    const C = () => (useI18n(), null);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(() => <C />)).toThrow("[@comvi/solid] no <I18nProvider>");
    err.mockRestore();
  });

  it("the nearest provider wins; unmounting one unsubscribes it", async () => {
    const a = createI18n({ locale: "en", messages: { en: { x: "A" } } });
    const b = createI18n({ locale: "en", messages: { en: { x: "B" } } });
    const C = () => <i>{useI18n().t("x") as string}</i>;
    const { container, unmount } = render(() => (
      <I18nProvider i18n={a}>
        <C />
        <I18nProvider i18n={b}>
          <C />
        </I18nProvider>
      </I18nProvider>
    ));
    expect(container.textContent).toBe("AB");
    const on = vi.spyOn(b, "on");
    unmount();
    await tick();
    expect(on).not.toHaveBeenCalled();
    await b.setLocale("de");
    expect(container.textContent).toBe("");
  });
});
