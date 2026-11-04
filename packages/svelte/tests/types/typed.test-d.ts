/**
 * Types of the binding with generated catalogs. Compiled by `pnpm test:types`: every
 * `@ts-expect-error` must fire, and every other line must compile.
 */
import type { Component } from "svelte";
import type { TFor } from "@comvi/core";
import {
  createI18n,
  T,
  useI18n,
  type BoundT,
  type Children,
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
  // `<T>` is checked in templates (tests/templates, svelte-check); a script never calls it with
  // its props alone, which Svelte 5 does not run.
  // @ts-expect-error a one-argument call of <T>
  T({ i18nKey: "terms" });
  // @ts-expect-error a one-argument call of the bound <T>
  DT({ i18nKey: "terms" });
  // @ts-expect-error a one-argument call of the bound shop <T>
  shop.T({ i18nKey: "cart.title", count: 1 });
  const l: string = locale;
  const d: "ltr" | "rtl" = dir;
  const b: boolean = isLoading && isReady;
  const p: Promise<void> = setLocale("de");
  const u: UseI18n["t"] = t;
  return [s, r, n, m, c, l, d, b, p, u];
}

/**
 * The binding's `t` IS the core's guarded one (R3-2 typo guard), as in @comvi/vue: the plan's
 * `TFor<NS, never>`. `<T>` takes the props of the core's `TComponentFor<…, 1, …>`, as a component.
 */
type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
export const sameTr: Equal<UseI18n<"shop">["t"], TFor<"shop", never>> = true;
// What svelte-check needs of a component in a template.
export const inMarkup: TComponent extends Component<any> ? true : false = true;
export const boundInMarkup: BoundT<"shop"> extends Component<any> ? true : false = true;
export const snippetText = (s: TagSnippet): TagSnippet => s;
