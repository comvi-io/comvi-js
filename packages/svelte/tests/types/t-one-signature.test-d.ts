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
 * the overload set as gone are the two `Parameters<…>` predicates: for an
 * overloaded or intersected function type `Parameters` silently resolves to
 * the LAST signature, so the key parameter read `never` when nothing was
 * bound, and only the bound namespace's own keys when something was.
 */

import { get } from "svelte/store";
import { useI18n } from "../../src/index";

// Merges with default-params.test-d.ts's and namespace-bound.test-d.ts's
// augmentations, which already close `TranslationKeys` for this program.
// `farewell` is the parameterless default key the existing set lacks.
declare module "@comvi/core" {
  interface TranslationKeys {
    farewell: never;
  }
}

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;
type Accepts<F extends (...args: never[]) => unknown, K> = K extends Parameters<F>[0]
  ? true
  : false;

// `t` is a store here, so the function under test is read with `get()`.
const root = useI18n();
const t = get(root.t);
const tRaw = get(root.tRaw);
const adminT = get(useI18n("admin").t);

// PIN 1: the key parameter is the whole union of accepted keys. It read `never`
// before, because `Parameters` resolved to the permissive overload.
export type _KeyIsNotNever = Expect<Equal<IsNever<Parameters<typeof t>[0]>, false>>;

// PIN 2: a bound namespace still accepts the default namespace's keys. Before,
// `NamespaceBoundTranslateFn` was an INTERSECTION of two call signatures and
// `Parameters` saw only the bound half, so this was false.
export type _BoundKeepsDefaultNsKeys = Expect<Accepts<typeof adminT, "greeting">>;

// CASE 1 — an unknown key. TS2345 naming the known keys, no overload list.
// @ts-expect-error `greting` is not a key
t("greting");

// CASE 2 — a required param forgotten. TS2554 "Expected 2 arguments, but got 1".
// @ts-expect-error `greeting` declares `formality` and `name`
t("greeting");

// CASE 3 — the wrong params. TS2345 whose second line names what is missing.
// @ts-expect-error `locale` is a routing option, not `formality` + `name`
t("greeting", { locale: "uk" });

// CASE 4 — a bound namespace is exact.
adminT("dashboard");
adminT("settings", { count: 1 });
adminT("greeting", { formality: "formal", name: "Eugene" });
// @ts-expect-error `checkout` belongs to `shop`, so it needs `{ ns: "shop" }`
adminT("checkout");
adminT("checkout", { ns: "shop" });

// Preserved: every accepting form the overload set had.
t("farewell");
t("farewell", { locale: "uk" });
t("greeting", { formality: "formal", name: "Eugene" });
t("dashboard", { ns: "admin" });
tRaw("farewell");

// Preserved: every rejecting form.
// @ts-expect-error a bare namespaced key still has to name its namespace
t("dashboard");
// @ts-expect-error a wrapper's `t` does not take the qualified spelling
t("admin:dashboard");
// @ts-expect-error a generated param keeps its value type
t("greeting", { formality: "nope", name: "Eugene" });

export {};
