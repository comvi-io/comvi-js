/**
 * Types of the binding with generated catalogs (typegen, lot 3, emits this augmentation).
 * Compiled by `pnpm test:types` (tsconfig.test-types.json): every `@ts-expect-error` must
 * fire, and every other line must compile.
 */
import type { ReactElement, ReactNode } from "react";
import { createI18n, I18nProvider, T, useI18n, type Tag } from "./lib";

declare module "@comvi/core" {
  interface Catalogs {
    default: {
      greeting: { name: string };
      title: never;
      items: { count: number };
      terms: { link: Tag };
    };
    shop: { "cart.title": { count: number } };
  }
}

const i18n = createI18n({ locale: "en" });
export const app: ReactElement = (
  <I18nProvider i18n={i18n} loading={<i />} suspense>
    <T i18nKey="greeting" name="Ann" />
    <T i18nKey="cart.title" ns="shop" count={1} />
    <T i18nKey="terms" link={(c: ReactNode) => <a>{c}</a>} />
    <T i18nKey="greeting" name="Ann" markers={false} />
    <T i18nKey="title" markers={false} />
    {/* @ts-expect-error markers is a boolean option */}
    <T i18nKey="title" markers="no" />
    {/* @ts-expect-error unknown key */}
    <T i18nKey="greting" name="Ann" />
    {/* @ts-expect-error missing param */}
    <T i18nKey="greeting" />
    {/* @ts-expect-error a key of another namespace */}
    <T i18nKey="cart.title" count={1} />
  </I18nProvider>
);

export function Component() {
  const { t, locale, dir, isLoading, setLocale } = useI18n();
  const s: string = t("greeting", { name: "Ann" });
  const r: ReactElement = t("terms", { link: (c) => <a>{c as ReactNode}</a> });
  const n: string = t("cart.title", { ns: "shop", count: 2 });
  const m: string = t("greeting", { name: "Ann", markers: false });
  void m;
  const shop = useI18n("shop");
  const c: string = shop.t("cart.title", { count: 1 });
  // @ts-expect-error a rich key is an element, not a string
  const e1: string = t("terms", { link: (x) => x });
  // @ts-expect-error missing param
  t("greeting");
  // @ts-expect-error typo key
  t("greting", { name: "x" });
  // @ts-expect-error a default-namespace key on the shop t
  shop.t("title");
  // The bound <T> of useI18n("shop") is typed by the shop keys (R3-5(b)).
  const ShopT = shop.T;
  const bt: ReactNode = <ShopT i18nKey="cart.title" count={1} markers={false} />;
  // @ts-expect-error a default-namespace key on the bound shop <T>
  const bt2: ReactNode = <ShopT i18nKey="greeting" name="x" />;
  // @ts-expect-error missing param on the bound <T>
  const bt3: ReactNode = <ShopT i18nKey="cart.title" />;
  const l: string = locale;
  const d: "ltr" | "rtl" = dir;
  const b: boolean = isLoading;
  const p: Promise<void> = setLocale("de");
  return [s, r, n, c, e1, bt, bt2, bt3, l, d, b, p];
}
