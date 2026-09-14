/**
 * Wave 6 Lot 3 — ONE call signature for `t()`, so a wrong call names its own
 * problem on the FIRST line.
 *
 * Under the three overloads every wrong call printed TS2769 "No overload
 * matches this call" followed by the failure of EACH overload, burying the one
 * useful line; a forgotten required param printed "not assignable to parameter
 * of type 'never'", which was the permissive overload's key once the registry
 * is closed. The before/after diagnostics are captured verbatim in the root
 * README's "Reading the type errors", and the `check=expect-error=TS####`
 * markers on those fences are what `pnpm check:snippets` holds the CODES to.
 *
 * `@ts-expect-error` can only assert THAT a call fails, and all of these
 * failed before too — the lot changed the MESSAGE, not the verdict — so the
 * block below is a preservation test. The one assertion that separates the two
 * designs is the PIN: `TranslateFn`'s namespaced overload accepted EVERY
 * namespace's bare keys, which made an unbound `t` satisfy the bound type. It
 * does not any more, because a bare key is now accepted only alongside the
 * namespace that declares it.
 */

import type { TranslationFunction } from "../../src/server/types";
import type { NamespaceBoundTranslateFn, TranslateFn } from "@comvi/core";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// PIN: an unbound `t` is NOT a namespace-bound one. Its key union has the
// default namespace's keys; the bound one adds `admin`'s. Under the overload
// set both accepted every namespace's bare keys, so this was `true`.
export type _UnboundIsNotBound = Expect<
  Equal<
    TranslateFn<{}, string> extends NamespaceBoundTranslateFn<"admin", {}, string> ? true : false,
    false
  >
>;

declare module "@comvi/core" {
  interface TranslationKeys {
    greeting: { formality: "formal" | "informal"; name: string };
    farewell: never;
    "admin:dashboard": never;
    "admin:settings": { count: number };
    "shop:checkout": never;
  }
}

declare const t: TranslationFunction;

// CASE 1 — an unknown key. TS2345 naming the known keys, no overload list.
// @ts-expect-error `greting` is not a key
t("greting");

// CASE 2 — a required param forgotten. TS2554 "Expected 2 arguments, but got 1".
// @ts-expect-error `greeting` declares `formality` and `name`
t("greeting");

// CASE 3 — the wrong params. TS2345 whose second line names what is missing.
// @ts-expect-error `locale` is a routing option, not `formality` + `name`
t("greeting", { locale: "uk" });

// CASE 4 — a namespaced key, reached with its namespace named. This package
// binds a namespace at RUNTIME but not in its TYPE, so core owns the
// bound-namespace probe; what is checked here is the explicit `{ ns }` form.
t("dashboard", { ns: "admin" });
t("settings", { ns: "admin", count: 1 });
// @ts-expect-error `dashboard` is not a key of `shop`
t("dashboard", { ns: "shop" });

// Preserved: every accepting form the overload set had.
t("farewell");
t("farewell", { locale: "uk" });
t("greeting", { formality: "formal", name: "Eugene" });
t("dashboard", { ns: "admin" });
t("greeting", { formality: "formal", name: "Eugene", extra: 1 });

// Preserved: every rejecting form.
// @ts-expect-error a bare namespaced key is not accepted without its namespace
t("dashboard");
// @ts-expect-error a generated param keeps its value type
t("greeting", { formality: "nope", name: "Eugene" });

// @ts-expect-error the server `t` does not take the qualified spelling either
t("admin:dashboard");

export {};
