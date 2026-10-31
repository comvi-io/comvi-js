/**
 * Binding parity (design R3-5, R3-18(3); lots 4–7): every 0.8 binding's `useI18n()` returns
 * the same members, and after unwrapping the framework's reactive container (Vue's refs,
 * Solid's accessors; Svelte's and React's are plain values) the state members have the same types. Compiled by `pnpm typecheck` (tsconfig.json
 * here): each `Equal<…>` must be `true`, and the `@ts-expect-error` lines must fire.
 *
 * Documented exceptions, each a framework's own idiom and nothing else:
 *   - `t`: the rich output is the framework's node (React `ReactElement`, Vue the list of
 *     parts, a render function's child, Solid a JSX child); Svelte's `t` has no rich output:
 *     a handler's result joins the string, rich text is `<T>`'s. Keys, params and options are
 *     core's one signature, and a call with text params only is `string` in all four.
 *   - `T`: a component of the framework.
 *   - `locale`, `dir`, `isReady`, `isLoading`: Vue hands out refs (`locale` writable:
 *     setting it switches), Solid accessors, React plain values of the render, Svelte getters
 *     over its reactive cell. `isReady` / `isLoading` are the core's predicates in all four
 *     (lot 4c, R3-26).
 * `pendingLocale` is in NO binding (R3-5: all or none): React would need it in the core's
 * state or a provider state of its own for a value `isLoading` already shows (lot 4).
 */
import type { Ref } from "vue";
import type { Accessor } from "solid-js";
import type { UseI18n as ReactUseI18n } from "../../packages/react/src";
import type { UseI18n as SolidUseI18n } from "../../packages/solid/src";
import type { UseI18n as SvelteUseI18n } from "../../packages/svelte/src/binding";
import type { UseI18n as VueUseI18n } from "../../packages/vue/src";

type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
/** A binding's `useI18n()` result as values: Vue's refs read through `.value`. */
type Unwrap<T> = { [K in keyof T]: T[K] extends Ref<infer V> ? V : T[K] };
/** The state members as values: Solid's accessors called. */
type UnwrapState<T> = {
  [K in keyof T]: K extends "locale" | "dir" | "isReady" | "isLoading"
    ? T[K] extends Accessor<infer V>
      ? V
      : never
    : T[K];
};

type R = ReactUseI18n<"shop">;
type V = Unwrap<VueUseI18n<"shop">>;
type So = UnwrapState<SolidUseI18n<"shop">>;
type Sv = SvelteUseI18n<"shop">;

export const sameMembers: Equal<keyof R, keyof V> = true;
export const sameMembersSolid: Equal<keyof R, keyof So> = true;
export const sameMembersSvelte: Equal<keyof R, keyof Sv> = true;
export const state: Equal<
  Pick<R, "locale" | "dir" | "isReady" | "isLoading">,
  Pick<V, "locale" | "dir" | "isReady" | "isLoading">
> = true;
export const stateSolid: Equal<
  Pick<R, "locale" | "dir" | "isReady" | "isLoading">,
  Pick<So, "locale" | "dir" | "isReady" | "isLoading">
> = true;
export const stateSvelte: Equal<
  Pick<R, "locale" | "dir" | "isReady" | "isLoading">,
  Pick<Sv, "locale" | "dir" | "isReady" | "isLoading">
> = true;
export const verbs: Equal<Pick<R, "setLocale" | "i18n">, Pick<V, "setLocale" | "i18n">> = true;
export const verbsSolid: Equal<
  Pick<R, "setLocale" | "i18n">,
  Pick<So, "setLocale" | "i18n">
> = true;
export const verbsSvelte: Equal<
  Pick<R, "setLocale" | "i18n">,
  Pick<Sv, "setLocale" | "i18n">
> = true;
// Untyped project (no generated catalogs): a text call is typed `string` in all; a rich
// call is `string` or the framework's node (lot 4b: honest types).
declare const rt: R["t"];
declare const vt: V["t"];
export const rText = rt("k", { n: 1, at: new Date() });
export const vText = vt("k", { n: 1, at: new Date() });
export const tText: Equal<typeof rText, string> = true;
export const tTextSame: Equal<typeof rText, typeof vText> = true;
declare const sot: So["t"];
declare const svt: Sv["t"];
export const soText = sot("k", { n: 1, at: new Date() });
export const svText = svt("k", { n: 1, at: new Date() });
export const tTextSolid: Equal<typeof soText, string> = true;
export const tTextSvelte: Equal<typeof svText, string> = true;
export const rRich = rt("k", { b: (c) => c });
export const vRich = vt("k", { b: (c) => c });
export const tRichHasText: Equal<
  Extract<typeof rRich, string>,
  Extract<typeof vRich, string>
> = true;
export const soRich = sot("k", { b: (c) => c });
// A Solid `JSX.Element` is a string among other things, so the text half reads this way round.
export const tRichSolid: string extends typeof soRich ? true : false = true;

// @ts-expect-error pendingLocale is in no binding (R3-5: all or none)
export const noPendingReact: R["pendingLocale"] = undefined;
// @ts-expect-error pendingLocale is in no binding (R3-5: all or none)
export const noPendingVue: V["pendingLocale"] = undefined;
// @ts-expect-error pendingLocale is in no binding (R3-5: all or none)
export const noPendingSolid: So["pendingLocale"] = undefined;
// @ts-expect-error pendingLocale is in no binding (R3-5: all or none)
export const noPendingSvelte: Sv["pendingLocale"] = undefined;
