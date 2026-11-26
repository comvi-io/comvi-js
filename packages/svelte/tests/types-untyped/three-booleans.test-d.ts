/**
 * The three booleans of `useI18n()` (owner decision 2026-11-26): `isReady`, `isLoading` and
 * `isFetching` are `boolean` getters; the dropped `availability` string is no member.
 */
import type { UseI18n } from "../../src";

type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

declare const u: UseI18n<"shop">;

export const flags: Equal<
  [UseI18n<"shop">["isReady"], UseI18n<"shop">["isLoading"], UseI18n<"shop">["isFetching"]],
  [boolean, boolean, boolean]
> = true;
// @ts-expect-error `availability` is not a member of the result
export const dropped = u.availability;
