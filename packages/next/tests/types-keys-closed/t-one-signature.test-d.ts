/**
 * Wave 6 Lot 3 — ONE call signature for `t()`, so a wrong call names its own
 * problem on the FIRST line.
 *
 * Under the three overloads every wrong call printed TS2769 "No overload
 * matches this call" followed by the failure of EACH overload, burying the one
 * useful line; a forgotten required param printed "not assignable to parameter
 * of type 'never'", which was the permissive overload's key once the registry
 * is closed. The before/after diagnostics are captured verbatim in the root
 * README's "Reading the type errors".
 *
 * `@ts-expect-error` can only assert THAT a call fails, and all five of these
 * failed before too, so the accept/reject block below is a preservation test:
 * the point of the lot was to change the MESSAGE, not the verdict. What pins
 * the overload set as gone are the `Parameters<…>` predicates: for an
 * overloaded or intersected function type `Parameters` silently resolves to
 * the LAST signature, so the key parameter read `never` when nothing was
 * bound, and only the bound namespace's own keys when something was.
 *
 * `@comvi/next`'s server `t` binds a namespace at RUNTIME (`getI18n({ ns })`)
 * but not in its TYPE, so there is no bound-namespace signature to read here —
 * case 4 is the explicit `{ ns }` form, and core owns the bound-namespace
 * probe.
 */
import type { TranslationFunction } from "../../src/server/types";

declare module "@comvi/core" {
  interface TranslationKeys {
    greeting: { formality: "formal" | "informal"; name: string };
    farewell: never;
    "admin:dashboard": never;
    "admin:settings": { count: number };
    "shop:checkout": never;
  }
}

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

declare const t: TranslationFunction;

// PIN 1: the key parameter is the whole union of accepted keys. It read `never`
// before, because `Parameters` resolved to the permissive overload.
export type _KeyIsNotNever = Expect<Equal<IsNever<Parameters<typeof t>[0]>, false>>;

// CASE 1 — an unknown key. TS2345 naming the known keys, no overload list.
// @ts-expect-error `greting` is not a key
t("greting");

// CASE 2 — a required param forgotten. TS2554 "Expected 2 arguments, but got 1".
// @ts-expect-error `greeting` declares `formality` and `name`
t("greeting");

// CASE 3 — the wrong params. TS2345 whose second line names what is missing.
// @ts-expect-error `locale` is a routing option, not `formality` + `name`
t("greeting", { locale: "uk" });

// CASE 4 — a namespaced key, reached with its namespace named.
t("dashboard", { ns: "admin" });
t("settings", { ns: "admin", count: 1 });
// @ts-expect-error `dashboard` is not a key of `shop`
t("dashboard", { ns: "shop" });

// Preserved: every accepting form the overload set had.
t("farewell");
t("farewell", { locale: "uk" });
t("greeting", { formality: "formal", name: "Eugene" });
t("dashboard", { ns: "admin" });

// Preserved: every rejecting form.
// @ts-expect-error a bare namespaced key still has to name its namespace
t("dashboard");
// @ts-expect-error a wrapper's `t` does not take the qualified spelling
t("admin:dashboard");
// @ts-expect-error a generated param keeps its value type
t("greeting", { formality: "nope", name: "Eugene" });

export {};
