/**
 * Binding parity (design R3-5, R3-18(3); lots 4–7): every 0.8 binding's `useI18n()` returns
 * the same members, and after unwrapping the framework's reactive container (Vue's refs)
 * the state members have the same types. Compiled by `pnpm typecheck` (tsconfig.json
 * here): each `Equal<…>` must be `true`, and the `@ts-expect-error` lines must fire.
 *
 * Documented exceptions, each a framework's own idiom and nothing else:
 *   - `t`: the rich output is the framework's node (React `ReactElement`, Vue the list of
 *     parts, a render function's child); keys, params and options are core's one signature.
 *   - `T`: a component of the framework (a React function component, a Vue functional one).
 *   - `locale`, `dir`, `isLoading`: Vue hands out refs (`locale` writable: setting it
 *     switches), React plain values of the render.
 * `pendingLocale` is in NO binding (R3-5: all or none): React would need it in the core's
 * state or a provider state of its own for a value `isLoading` already shows (lot 4).
 * Solid and Svelte join in lot 5.
 */
import type { Ref } from "vue";
import type { UseI18n as ReactUseI18n } from "../../packages/react/src";
import type { UseI18n as VueUseI18n } from "../../packages/vue/src";

type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
/** A binding's `useI18n()` result as values: Vue's refs read through `.value`. */
type Unwrap<T> = { [K in keyof T]: T[K] extends Ref<infer V> ? V : T[K] };

type R = ReactUseI18n<"shop">;
type V = Unwrap<VueUseI18n<"shop">>;

export const sameMembers: Equal<keyof R, keyof V> = true;
export const state: Equal<
  Pick<R, "locale" | "dir" | "isLoading">,
  Pick<V, "locale" | "dir" | "isLoading">
> = true;
export const verbs: Equal<Pick<R, "setLocale" | "i18n">, Pick<V, "setLocale" | "i18n">> = true;
// Untyped project (no generated catalogs): t() is typed `string` in both.
export const t: Equal<ReturnType<R["t"]>, ReturnType<V["t"]>> = true;

// @ts-expect-error pendingLocale is in no binding (R3-5: all or none)
export const noPendingReact: R["pendingLocale"] = undefined;
// @ts-expect-error pendingLocale is in no binding (R3-5: all or none)
export const noPendingVue: V["pendingLocale"] = undefined;
