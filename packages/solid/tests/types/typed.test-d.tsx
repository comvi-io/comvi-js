/**
 * Types of the binding with generated catalogs (typegen, lot 3, emits this augmentation).
 * Compiled by `pnpm test:types` (tsconfig.test-types.json): every `@ts-expect-error` must
 * fire, and every other line must compile.
 */
import type { Accessor, JSX } from "solid-js";
import type { BoundTFor, TComponentFor } from "@comvi/core";
import {
  createI18n,
  I18nProvider,
  T,
  useI18n,
  type Tag,
  type TagComponent,
  type UseI18n,
} from "./lib";

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
export const app = (
  <I18nProvider i18n={i18n} loading={<i />}>
    <T i18nKey="greeting" name="Ann" />
    <T i18nKey="cart.title" ns="shop" count={1} />
    <T i18nKey="terms" link={(c: JSX.Element) => <a>{c}</a>} />
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
    {/* A tag param is optional when `components` is passed: it may render the tag. */}
    <T i18nKey="terms" components={{ link: "a" }} />
    {/* @ts-expect-error without `components` a tag still needs its handler */}
    <T i18nKey="terms" />
    <T i18nKey="terms" components={{ link: { component: "a", props: { href: "/terms" } } }} />
    {/* @ts-expect-error a component entry is not a number */}
    <T i18nKey="terms" components={{ link: 1 }} />
    {/* @ts-expect-error a handler prop still has its type */}
    <T i18nKey="terms" link={(c: number) => c} />
  </I18nProvider>
);

export function Component() {
  const { t, locale, dir, isLoading, isReady, setLocale } = useI18n();
  const s: string = t("greeting", { name: "Ann" });
  const r: JSX.Element = t("terms", { link: (c) => <a>{c}</a> });
  // The registered TagChildren types an inline handler's argument: one JSX element.
  t("terms", {
    link: (c) => {
      const node: JSX.Element = c;
      return <a>{node}</a>;
    },
  });
  // @ts-expect-error a handler's argument is a JSX.Element, not a number (was `any`)
  t("terms", { link: (c: number) => c });
  const n: string = t("cart.title", { ns: "shop", count: 2 });
  const shop = useI18n("shop");
  const c: string = shop.t("cart.title", { count: 1 });
  // @ts-expect-error missing param
  t("greeting");
  // @ts-expect-error typo key
  t("greting", { name: "x" });
  // @ts-expect-error a default-namespace key on the shop t
  shop.t("title");
  // The bound <T> of useI18n("shop") is typed by the shop keys (R3-5(b)).
  const ShopT = shop.T;
  const bt = <ShopT i18nKey="cart.title" count={1} markers={false} />;
  // @ts-expect-error a default-namespace key on the bound shop <T>
  const bt2 = <ShopT i18nKey="greeting" name="x" />;
  // @ts-expect-error missing param on the bound <T>
  const bt3 = <ShopT i18nKey="cart.title" />;
  const DefT = useI18n().T;
  const bt5 = <DefT i18nKey="terms" components={{ link: "a" }} />;
  const bt6 = <DefT i18nKey="terms" link={(x) => <a>{x}</a>} />;
  // @ts-expect-error a missing tag handler on the bound <T>, no components
  const bt7 = <DefT i18nKey="terms" />;
  const l: Accessor<string> = locale;
  const d: Accessor<"ltr" | "rtl"> = dir;
  const b: Accessor<boolean> = isLoading;
  const y: Accessor<boolean> = isReady;
  const p: Promise<void> = setLocale("de");
  return [s, r, n, c, bt, bt2, bt3, bt5, bt6, bt7, l, d, b, y, p];
}

/**
 * The binding's `<T>` types ARE the core's guarded ones with the `components` prop: the types
 * bench measures exactly these, so a binding type that drifts fails here.
 */
type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
type C = Readonly<Record<string, TagComponent>>;
export const sameT: Equal<typeof T, TComponentFor<JSX.Element, 2, C>> = true;
export const sameBound: Equal<UseI18n<"shop">["T"], BoundTFor<"shop", JSX.Element, 2, C>> = true;
