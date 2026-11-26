/**
 * The three booleans of `useI18n()` (owner decision 2026-11-26) in every binding: after
 * unwrapping the framework's container (Vue's computed ref, Solid's accessor; React's and
 * Svelte's are plain values) `isReady`, `isLoading` and `isFetching` are `boolean`, and no
 * binding has the dropped `availability`. Compiled by `pnpm typecheck` (tsconfig.json here).
 */
import type { ComputedRef } from "vue";
import type { Accessor } from "solid-js";
import type { UseI18n as ReactUseI18n } from "../../packages/react/src";
import type { UseI18n as SolidUseI18n } from "../../packages/solid/src";
import type { UseI18n as SvelteUseI18n } from "../../packages/svelte/src/binding";
import type { UseI18n as VueUseI18n } from "../../packages/vue/src";

type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Flags<T> = [T, T, T];
type Of<U extends { isReady: unknown; isLoading: unknown; isFetching: unknown }> = [
  U["isReady"],
  U["isLoading"],
  U["isFetching"],
];

export const react: Equal<Of<ReactUseI18n<"shop">>, Flags<boolean>> = true;
export const vue: Equal<Of<VueUseI18n<"shop">>, Flags<ComputedRef<boolean>>> = true;
export const solid: Equal<Of<SolidUseI18n<"shop">>, Flags<Accessor<boolean>>> = true;
export const svelte: Equal<Of<SvelteUseI18n<"shop">>, Flags<boolean>> = true;
export const noAvailability: Equal<
  [
    "availability" extends keyof ReactUseI18n<"shop"> ? 1 : 0,
    "availability" extends keyof VueUseI18n<"shop"> ? 1 : 0,
    "availability" extends keyof SolidUseI18n<"shop"> ? 1 : 0,
    "availability" extends keyof SvelteUseI18n<"shop"> ? 1 : 0,
  ],
  [0, 0, 0, 0]
> = true;
