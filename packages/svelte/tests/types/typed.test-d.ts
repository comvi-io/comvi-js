/**
 * Types of the binding with generated catalogs. Compiled by `pnpm test:types`: every
 * `@ts-expect-error` must fire, and every other line must compile.
 */
import type { Component } from "svelte";
import type { BoundTFor, TComponentFor, TFor } from "@comvi/core";
import {
  createI18n,
  T,
  useI18n,
  type BoundT,
  type Children,
  type TagComponent,
  type TagSnippet,
  type TComponent,
  type UseI18n,
} from "../../src";

createI18n({ locale: "en" });

export function setup() {
  const { t, locale, dir, isReady, isLoading, setLocale, T: DT } = useI18n();
  const s: string = t("greeting", { name: "Ann" });
  // In `t()` a tag handler's output joins into the string.
  const r: string = t("terms", { link: (c) => `[${c}]` });
  // The registered TagChildren types an inline handler's argument.
  t("terms", {
    link: (c) => {
      const child: Children = c;
      return child;
    },
  });
  // @ts-expect-error a handler's argument is text or the parts, not a number
  t("terms", { link: (c: number) => c });
  // @ts-expect-error a rich key's handler is required in t()
  t("terms");
  const n: string = t("cart.title", { ns: "shop", count: 2 });
  const m: string = t("greeting", { name: "Ann", markers: false });
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
  ShopT({ i18nKey: "cart.title", count: 1, markers: false });
  // @ts-expect-error a default-namespace key on the bound shop <T>
  ShopT({ i18nKey: "greeting", name: "x" });
  // @ts-expect-error missing param on the bound <T>
  ShopT({ i18nKey: "cart.title" });
  // @ts-expect-error a typo on the bound <T> (the key errs; its params stay loose, R3-2)
  ShopT({ i18nKey: "cart.titel", count: 1 });
  // A tag param is optional on <T>: `components` or a snippet of the tag's name may render it.
  T({ i18nKey: "terms" });
  DT({ i18nKey: "terms" });
  // @ts-expect-error a typo on <T>
  T({ i18nKey: "greting" });
  const l: string = locale;
  const d: "ltr" | "rtl" = dir;
  const b: boolean = isLoading && isReady;
  const p: Promise<void> = setLocale("de");
  const u: UseI18n["t"] = t;
  return [s, r, n, m, c, l, d, b, p, u];
}

/**
 * The binding's types ARE the core's guarded ones (R3-2 typo guard), as in @comvi/vue: the plan's
 * `TFor<NS, never>` for `t`, `TComponentFor<…, 1, …>` and `BoundTFor<…, 1, …>` beside the
 * `Component` half a template reads.
 */
type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
type C = Readonly<Record<string, TagComponent>>;
export const sameTr: Equal<UseI18n<"shop">["t"], TFor<"shop", never>> = true;
export const typedT: typeof T extends TComponentFor<void, 1, C> ? true : false = true;
export const typedBound: BoundT<"shop"> extends BoundTFor<"shop", void, 1, C> ? true : false = true;
// What svelte-check needs of a component in a template.
export const inMarkup: TComponent extends Component<any> ? true : false = true;
export const boundInMarkup: BoundT<"shop"> extends Component<any> ? true : false = true;
export const snippetText = (s: TagSnippet): TagSnippet => s;
