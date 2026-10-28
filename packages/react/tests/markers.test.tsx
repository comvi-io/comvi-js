/**
 * The editor marking hook through React (design R3-14 H4, H7, H9): output rendered after
 * `x.mark(fn)` is marked because the hook travels on the PUBLISHED state the provider
 * reads after commit (H7) — no React code is involved; `<T markers={false}>` and
 * `t(key, { markers: false })` are never marked (the props are the params, and the core
 * reads `markers` as a per-call option); `<I18nHandover>`'s render-local view inherits the
 * hook; an instance without `devtools()` is never marked.
 */
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { devtools, type ComviHandle, type ComviQueueEntry, type Mark } from "@comvi/core/devtools";
import { createI18n, I18nHandover, I18nProvider, T, useI18n, type I18n } from "../src";

const win = window as { __COMVI__?: ComviQueueEntry[] };
afterEach(() => {
  delete win.__COMVI__;
});

const MSGS = { hi: "Hi", name: "Hi {n}", rich: "Read <b>this</b>" };
const make = (plugins = [devtools()]) =>
  createI18n({ locale: "en", messages: { en: MSGS }, onError: () => {}, plugins });
const handle = (i18n: I18n): ComviHandle => win.__COMVI__!.find((e) => e.i === i18n)!.x;
const mark = vi.fn<Mark>((out, key) => (typeof out == "string" ? `[${key}:${out}]` : out));

const Probe = () => {
  const { t } = useI18n();
  return (
    <>
      <p id="t">{t("name", { n: "A" })}</p>
      <p id="off">{t("hi", { markers: false })}</p>
      <p id="T">
        <T i18nKey="hi" />
      </p>
      <p id="Toff">
        <T i18nKey="hi" markers={false} />
      </p>
      <p id="missing">
        <T i18nKey="gone" />
      </p>
    </>
  );
};
const text = (c: HTMLElement) =>
  ["t", "off", "T", "Toff", "missing"].map((id) => c.querySelector(`#${id}`)!.textContent);

describe("marking in React", () => {
  it("x.mark re-renders the mounted tree marked; markers={false} opts out; mark(null) unmarks", () => {
    const i18n = make();
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(text(container)).toEqual(["Hi A", "Hi", "Hi", "Hi", "gone"]);
    act(() => handle(i18n).mark(mark));
    expect(text(container)).toEqual(["[name:Hi A]", "Hi", "[hi:Hi]", "Hi", "[gone:gone]"]);
    act(() => handle(i18n).mark(null));
    expect(text(container)).toEqual(["Hi A", "Hi", "Hi", "Hi", "gone"]);
  });

  it("the bound <T> of useI18n(ns) takes markers={false} too", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { shop: { en: { buy: "Buy" } } },
      plugins: [devtools()],
    });
    handle(i18n).mark(mark);
    const Shop = () => {
      const { T: ShopT } = useI18n("shop");
      return (
        <>
          <ShopT i18nKey="buy" />|<ShopT i18nKey="buy" markers={false} />
        </>
      );
    };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Shop />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("[buy:Buy]|Buy");
  });

  it("<I18nHandover>'s render-local view is marked (view() inherits the hook)", () => {
    const i18n = make();
    handle(i18n).mark(mark);
    const Hi = () => <>{useI18n().t("hi")}</>;
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover catalogs={{ default: { de: { hi: "Hallo" } } }} locale="de">
          <Hi />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(container.textContent).toBe("[hi:Hallo]");
  });

  it("an instance without devtools() renders unmarked", () => {
    const i18n = make([]);
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(text(container)).toEqual(["Hi A", "Hi", "Hi", "Hi", "gone"]);
    expect(win.__COMVI__).toBeUndefined();
  });
});
