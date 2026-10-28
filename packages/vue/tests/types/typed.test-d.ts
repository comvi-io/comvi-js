/**
 * Types of the binding with generated catalogs (typegen v2 emits catalogs.d.ts). Compiled
 * by `pnpm test:types` (vue-tsc, tsconfig.test-types.json): every `@ts-expect-error` must
 * fire, and every other line must compile. Templates: Typed.vue.
 */
import { h, type VNode } from "vue";
import { createI18n, useI18n, type UseI18n } from "../../src";

createI18n({ locale: "en" });

export function setup() {
  const { t, locale, dir, isLoading, setLocale, T } = useI18n();
  const s: string = t("greeting", { name: "Ann" });
  const r: VNode = t("terms", { link: (c) => h("a", c) });
  // The registered TagChildren types an inline handler's argument: text or one node.
  t("terms", {
    link: (c) => {
      const child: string | VNode = c;
      return h("a", child);
    },
  });
  // @ts-expect-error a handler's argument is text or a node, not a number
  t("terms", { link: (c: number) => c });
  const n: string = t("cart.title", { ns: "shop", count: 2 });
  const m: string = t("greeting", { name: "Ann", markers: false });
  const shop = useI18n("shop");
  const c: string = shop.t("cart.title", { count: 1 });
  // @ts-expect-error a rich key is a node, not a string
  const e1: string = t("terms", { link: (x) => x });
  // @ts-expect-error missing param
  t("greeting");
  // @ts-expect-error typo key
  t("greting", { name: "x" });
  // @ts-expect-error a default-namespace key on the shop t
  shop.t("title");
  // The bound <T> of useI18n("shop") is typed by the shop keys (R3-5(b)).
  const ShopT = shop.T;
  const bt: VNode = ShopT({ i18nKey: "cart.title", count: 1, markers: false });
  // @ts-expect-error a default-namespace key on the bound shop <T>
  ShopT({ i18nKey: "greeting", name: "x" });
  // @ts-expect-error missing param on the bound <T>
  ShopT({ i18nKey: "cart.title" });
  // @ts-expect-error a typo on the bound <T> (the key errs; its params stay loose, R3-2)
  ShopT({ i18nKey: "cart.titel", count: 1 });
  // A tag param is optional on <T>: a slot of the tag's name may give the handler.
  T({ i18nKey: "terms" });
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
