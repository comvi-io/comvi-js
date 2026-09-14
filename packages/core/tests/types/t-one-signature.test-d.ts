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

import { createI18n } from "@comvi/core";
import type { NamespaceBoundTranslateFn } from "@comvi/core";

// Merges with translation-keys.test-d.ts's augmentation, which already closes
// `TranslationKeys` for this program. `farewell` is the parameterless default
// key the existing set lacks; the two namespaced entries give case 4 a second
// namespace to be wrong about.
declare module "@comvi/core" {
  interface TranslationKeys {
    farewell: never;
    "admin:dashboard": never;
    "shop:checkout": never;
  }
}

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;
type Accepts<F extends (...args: never[]) => unknown, K> = K extends Parameters<F>[0]
  ? true
  : false;

const i18n = createI18n({ locale: "en" });
const t = i18n.t.bind(i18n);

// Core has no `useI18n(ns)`; the bound narrowing it exports to the four
// wrappers is this type, so it is what the bound cases are read through.
declare const adminT: NamespaceBoundTranslateFn<"admin", {}, string>;

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
adminT("greeting", { formality: "formal", name: "Eugene" });
// @ts-expect-error `checkout` belongs to `shop`, so it needs `{ ns: "shop" }`
adminT("checkout");
adminT("checkout", { ns: "shop" });

// Preserved: every accepting form the overload set had.
t("farewell");
t("farewell", { locale: "uk" });
t("greeting", { formality: "formal", name: "Eugene" });
t("dashboard", { ns: "admin" });
t("admin:dashboard");
t(null);
i18n.tRaw("greeting", { formality: "formal", name: "Eugene" });

// Preserved: every rejecting form.
// @ts-expect-error a bare namespaced key still has to name its namespace
t("dashboard");
// @ts-expect-error `dashboard` is not a key of `shop`
t("dashboard", { ns: "shop" });
// @ts-expect-error a generated param keeps its value type
t("greeting", { formality: "nope", name: "Eugene" });

export {};
