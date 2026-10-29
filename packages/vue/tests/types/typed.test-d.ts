/**
 * Types of the binding with generated catalogs (typegen v2 emits catalogs.d.ts). Compiled
 * by `pnpm test:types` (vue-tsc, tsconfig.test-types.json): every `@ts-expect-error` must
 * fire, and every other line must compile. Templates: Typed.vue.
 */
import { h, type ComponentCustomProperties, type VNodeArrayChildren, type VNodeChild } from "vue";
import type { BoundTFor, TComponentFor, TFor } from "@comvi/core";
import { createI18n, T, useI18n, type Children, type TagComponent, type UseI18n } from "../../src";

createI18n({ locale: "en" });

export function setup() {
  const { t, locale, dir, isLoading, setLocale, T: DT } = useI18n();
  const s: string = t("greeting", { name: "Ann" });
  const r: VNodeArrayChildren = t("terms", { link: (c) => h("a", c) });
  // The registered TagChildren types an inline handler's argument: text, or the parts.
  t("terms", {
    link: (c) => {
      const child: Children = c;
      return h("a", child);
    },
  });
  // @ts-expect-error a handler's argument is text or the parts, not a number
  t("terms", { link: (c: number) => c });
  const n: string = t("cart.title", { ns: "shop", count: 2 });
  const m: string = t("greeting", { name: "Ann", markers: false });
  const shop = useI18n("shop");
  const c: string = shop.t("cart.title", { count: 1 });
  // @ts-expect-error a rich key renders its parts, not a string
  const e1: string = t("terms", { link: (x) => x });
  // @ts-expect-error missing param
  t("greeting");
  // @ts-expect-error typo key
  t("greting", { name: "x" });
  // @ts-expect-error a default-namespace key on the shop t
  shop.t("title");
  // The bound <T> of useI18n("shop") is typed by the shop keys (R3-5(b)).
  const ShopT = shop.T;
  const bt: VNodeChild = ShopT({ i18nKey: "cart.title", count: 1, markers: false });
  // @ts-expect-error a default-namespace key on the bound shop <T>
  ShopT({ i18nKey: "greeting", name: "x" });
  // @ts-expect-error missing param on the bound <T>
  ShopT({ i18nKey: "cart.title" });
  // @ts-expect-error a typo on the bound <T> (the key errs; its params stay loose, R3-2)
  ShopT({ i18nKey: "cart.titel", count: 1 });
  // A tag param is optional on <T>: a slot of the tag's name may give the handler.
  T({ i18nKey: "terms" });
  DT({ i18nKey: "terms" });
  const l: string = locale.value;
  locale.value = "de";
  // @ts-expect-error the locale is a string
  locale.value = 1;
  const d: "ltr" | "rtl" = dir.value;
  const b: boolean = isLoading.value;
  // @ts-expect-error isLoading is read-only
  isLoading.value = true;
  const p: Promise<void> = setLocale("de");
  const u: UseI18n["t"] = t;
  return [s, r, n, m, c, e1, bt, l, d, b, p, u];
}

/**
 * The binding's types ARE the core's guarded ones (R3-2 typo guard): the types bench
 * (scripts/types-bench/gen.mjs VUE_LIB) measures `TComponentFor` / `BoundTFor` / `TFor` at
 * 5k/20k keys, so these identities are what makes its counts the binding's. A wrapper that
 * drops the guard (`K extends KeysOf[N]` without `| NotAKey`) or distributes over the keys
 * fails here, not only in an editor that hangs.
 */
type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
type C = Readonly<Record<string, TagComponent>>;
export const sameT: Equal<typeof T, TComponentFor<VNodeChild, 1, C>> = true;
export const sameBound: Equal<UseI18n<"shop">["T"], BoundTFor<"shop", VNodeChild, 1, C>> = true;
export const sameBoundDefault: Equal<UseI18n["T"], BoundTFor<"default", VNodeChild, 1, C>> = true;
export const sameTr: Equal<UseI18n<"shop">["t"], TFor<"shop", VNodeArrayChildren>> = true;
export const same$t: Equal<
  ComponentCustomProperties["$t"],
  TFor<"default", VNodeArrayChildren>
> = true;
