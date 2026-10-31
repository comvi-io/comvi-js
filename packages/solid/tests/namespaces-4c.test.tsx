/**
 * Lot 4c (owner brief 29.10, R3-26) through Solid components: `useI18n(ns)` reads, loads and
 * holds `ns` from mount to cleanup; `<T>` reads only; `isReady` / `isLoading` from the state,
 * with no "unavailable" frame before the mount; the first-paint gate on the core's `isReady`;
 * the key scenario. Ported by meaning from @comvi/react's and @comvi/vue's suites.
 */
import { createEffect, createSignal, For, Show, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, T, useI18n, type I18n } from "../src";
import { make, manualLoader, tick } from "./helpers";

/** Every state's `isReady/isLoading` of `ns`, and its text. */
const probe = (ns: string, key = "title") => {
  const frames: string[] = [];
  const P = () => {
    const { t, isReady, isLoading } = useI18n(ns);
    createEffect(() => frames.push(`${isReady()}/${isLoading()}`));
    return <p>{isReady() ? (t(key) as string) : isLoading() ? "…" : "unavailable"}</p>;
  };
  return { P, frames };
};

const app = (i18n: I18n, children: () => JSX.Element, loading?: JSX.Element) =>
  render(() => (
    <I18nProvider i18n={i18n} loading={loading}>
      {children()}
    </I18nProvider>
  ));

describe("first-paint gate on the core's isReady", () => {
  it("a catalog of a locale outside the chain does not open it: the placeholder shows", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "uk", messages: { en: { title: "Account" } }, loader: l.load });
    const Title = () => <p>{useI18n().t("title") as string}</p>;
    const { container } = app(i18n, () => <Title />, "loading");
    expect(container.textContent).toBe("loading");
    await l.answer("uk:default", { title: "Обліковий запис" });
    expect(container.textContent).toBe("Обліковий запис");
  });

  it("with fallbackLocale: 'en' the English text shows at once", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "uk",
      fallbackLocale: "en",
      messages: { en: { title: "Account" } },
      loader: l.load,
    });
    const Title = () => <p>{useI18n().t("title") as string}</p>;
    const { container } = app(i18n, () => <Title />, "loading");
    expect(container.textContent).toBe("Account");
    await l.answer("uk:default", { title: "Обліковий запис" });
    expect(container.textContent).toBe("Обліковий запис");
  });

  it("no `loading`: the children render while the first catalogs load", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    const Title = () => <p>{useI18n().t("title") as string}</p>;
    const { container } = app(i18n, () => <Title />);
    expect(container.textContent).toBe("title");
    await l.answer("en:default", { title: "Account" });
    expect(container.textContent).toBe("Account");
  });

  it("gates the first paint only: a switch and a later provider of the instance never unmount", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    let mounts = 0;
    const Title = () => {
      mounts++;
      return <p>{useI18n().t("title") as string}</p>;
    };
    const { container } = app(i18n, () => <Title />, "loading");
    await l.answer("en:default", { title: "Account" });
    expect(mounts).toBe(1);
    const sw = i18n.setLocale("de");
    expect(container.textContent).toBe("Account"); // the old locale until the new one lands
    const second = app(i18n, () => <Title />, "loading");
    expect(second.container.textContent).toBe("Account");
    await l.answer("de:default", { title: "Konto" });
    await sw;
    expect(container.textContent).toBe("Konto");
    expect(mounts).toBe(2);
  });
});

describe("isReady / isLoading from the state", () => {
  it("first load: not ready and loading from the first read (before the mount) to the catalog", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P, frames } = probe("shop");
    const { container } = app(i18n, () => <P />);
    expect(warn).not.toHaveBeenCalled();
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
    const { container } = app(i18n, () => <P />);
    expect(frames[0]).toBe("true/true");
    expect(container.textContent).toBe("Shop");
    await l.fail("uk:shop");
    expect(frames.at(-1)).toBe("true/false");
    // No catalog at all and a failure: the "unavailable" branch, no endless spinner.
    const { i18n: other } = make({ locale: "uk", messages: { uk: {} }, loader: l.load });
    const q = probe("help");
    const r = app(other, () => <q.P />);
    await l.fail("uk:help");
    expect(q.frames.at(-1)).toBe("false/false");
    expect(r.container.textContent).toBe("unavailable");
  });
});

describe("consumers", () => {
  it("holds at mount, never during setup: nothing is requested until the component is on screen", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    let duringSetup: string[] = [];
    const P = () => {
      useI18n("shop");
      duringSetup = [...l.requested];
      return null;
    };
    app(i18n, () => <P />);
    expect(duringSetup).toEqual([]);
    expect(l.requested).toEqual(["en:shop"]);
  });

  it("two consumers share one flight; disposing one keeps the namespace active", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    const [items, setItems] = createSignal([1, 2]);
    const { container } = app(i18n, () => <For each={items()}>{() => <P />}</For>);
    expect(l.requested).toEqual(["en:shop"]);
    await l.answer("en:shop", { title: "Shop" });
    setItems([1]);
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]);
    await l.answer("de:default");
    await l.answer("de:shop", { title: "Laden" });
    await sw;
    expect(container.textContent).toBe("Laden");
  });

  it("the last consumer disposed keeps the cache and releases once; the next switch does not load it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    const [on, show] = createSignal(true);
    const { container } = app(i18n, () => <Show when={on()}>{<P />}</Show>);
    await l.answer("en:shop", { title: "Shop" });
    show(false);
    const sw = i18n.setLocale("de");
    await l.answer("de:default");
    await sw;
    expect(l.requested).toEqual(["en:shop", "de:default"]);
    await i18n.setLocale("en");
    show(true);
    expect(container.textContent).toBe("Shop");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
  });

  it("disposing the root releases the namespace", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    const { unmount } = app(i18n, () => <P />);
    await l.answer("en:shop");
    unmount();
    const sw = i18n.setLocale("fr");
    expect(l.requested).toEqual(["en:shop", "fr:default"]);
    await l.answer("fr:default");
    await sw;
  });

  it("the key scenario: account → default page → switch: only default loads; back on account: loading, then the text", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    await l.answer("en:default", { home: "Home" });
    const account = probe("account");
    const Home = () => <p>{useI18n().t("home") as string}</p>;
    const [page, go] = createSignal("account");
    const { container } = app(i18n, () => (
      <Show when={page() == "account"} fallback={<Home />}>
        <account.P />
      </Show>
    ));
    await l.answer("en:account", { title: "Account" });
    expect(container.textContent).toBe("Account");
    go("home");
    const sw = i18n.setLocale("de");
    await l.answer("de:default", { home: "Start" });
    await sw;
    expect(container.textContent).toBe("Start");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default"]);
    account.frames.length = 0;
    go("account");
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
    const [on, show] = createSignal(false);
    const { container } = app(i18n, () => <Show when={on()}>{<P />}</Show>);
    const sw = i18n.setLocale("de");
    show(true);
    expect(l.requested).toEqual(["de:default", "en:shop"]);
    await l.answer("de:default");
    await sw;
    expect(l.requested).toEqual(["de:default", "en:shop", "de:shop"]);
    await l.answer("de:shop", { title: "Laden" });
    expect(container.textContent).toBe("Laden");
  });

  it("a remount does not fetch a failed namespace again; i18n.load(ns) retries", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { P } = probe("shop");
    const [on, show] = createSignal(true);
    const { container } = app(i18n, () => <Show when={on()}>{<P />}</Show>);
    await l.fail("en:shop");
    show(false);
    show(true);
    expect(l.requested).toEqual(["en:shop"]);
    expect(container.textContent).toBe("unavailable");
    void i18n.load("shop");
    await l.answer("en:shop", { title: "Shop" });
    expect(container.textContent).toBe("Shop");
  });
});

/** The missing_key reports of `errors`, as `key ns locale`. */
const mk = (errors: { code: string; key?: string; ns?: string; locale?: string }[]) =>
  errors.filter((e) => e.code == "missing_key").map((e) => `${e.key} ${e.ns} ${e.locale}`);

describe("missing_key: silent only while a load that could bring the key is coming", () => {
  it("t, the bound T and the exported <T ns>: silent before the catalog, reported for a key the loaded catalog lacks", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const P = () => {
      const { t, T: B } = useI18n("shop");
      return (
        <p>
          {t("a") as string}
          <B i18nKey="b" />
          <T i18nKey="c" ns="shop" />
        </p>
      );
    };
    app(i18n, () => <P />);
    expect(mk(errors)).toEqual([]);
    await l.answer("en:shop", {});
    expect(new Set(mk(errors))).toEqual(new Set(["a shop en", "b shop en", "c shop en"]));
  });

  it("a failed main-locale load with a fallback catalog lacking the key: every surface reports", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({
      locale: "de",
      fallbackLocale: "en",
      catalogs: { shop: { en: { other: "x" } } },
      messages: { de: {}, en: {} },
      loader: l.load,
    });
    const P = () => {
      const { t, T: B } = useI18n("shop");
      return (
        <p>
          {t("a") as string}
          <B i18nKey="b" />
          <T i18nKey="c" ns="shop" />
        </p>
      );
    };
    app(i18n, () => <P />);
    expect(mk(errors)).toEqual([]);
    await l.fail("de:shop");
    expect(errors[0].code).toBe("load_failed");
    expect(new Set(mk(errors))).toEqual(new Set(["a shop de", "b shop de", "c shop de"]));
  });
});

describe("reading never loads", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  afterEach(() => warn?.mockRestore());

  it("<T ns> renders what is there and requests nothing; development warns once", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { container } = app(i18n, () => (
      <>
        <T i18nKey="title" ns="account" />
        <T i18nKey="other" ns="account" />
      </>
    ));
    await tick();
    expect(l.requested).toEqual([]);
    expect(container.textContent).toBe("titleother");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"account"');
  });

  it("useI18n(ns).T reads the namespace its useI18n holds: loaded once, no warning", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Page = () => {
      const { T: B } = useI18n("account");
      return <B i18nKey="title" />;
    };
    const { container } = app(i18n, () => <Page />);
    expect(l.requested).toEqual(["en:account"]);
    await l.answer("en:account", { title: "Account" });
    expect(container.textContent).toBe("Account");
    expect(warn).not.toHaveBeenCalled();
  });

  it("the exported <T ns> beside useI18n(ns) of the same component: no idle warning", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Page = () => {
      useI18n("account");
      return <T i18nKey="title" ns="account" />;
    };
    const { container } = app(i18n, () => <Page />);
    await tick();
    expect(l.requested).toEqual(["en:account"]);
    await l.answer("en:account", { title: "Account" });
    expect(container.textContent).toBe("Account");
    expect(warn).not.toHaveBeenCalled();
  });

  it("useI18n(ns).t of another namespace (a per-call { ns }) is not declared by it: development warns", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Page = () => <p>{useI18n().t("title", { ns: "undeclared" }) as string}</p>;
    app(i18n, () => <Page />);
    await tick();
    expect(l.requested).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"undeclared"');
  });
});
