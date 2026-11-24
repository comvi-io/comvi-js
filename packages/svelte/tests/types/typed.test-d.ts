/**
 * Types of the binding with generated catalogs. Compiled by `pnpm test:types`: every
 * `@ts-expect-error` must fire, and every other line must compile.
 */
import type { Component } from "svelte";
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
  // `t()` takes no rich key (owner decision 21.11.2026): rich text is `<T>`'s.
  // @ts-expect-error a rich key in t(), with a handler for its tag
  t("terms", { link: (c: string) => `[${c}]` });
  // @ts-expect-error a rich key in t()
  t("terms");
  // @ts-expect-error a rich key through { ns } too
  t("terms", { ns: "default", link: (c: string) => c });
  const r: string = t("title");
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
 * The binding's `t` is the core's guarded one (R3-2 typo guard) without the rich keys: the
 * lines above. `<T>` takes the props of the core's `TComponentFor<…, 1, …>`, as a component.
 */
// A tag handler's argument type, which `<T>` replaces with a snippet.
export const children = (c: Children): Children => c;
// What svelte-check needs of a component in a template.
export const inMarkup: TComponent extends Component<any> ? true : false = true;
export const boundInMarkup: BoundT<"shop"> extends Component<any> ? true : false = true;
export const snippetText = (s: TagSnippet): TagSnippet => s;
