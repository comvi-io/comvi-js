/**
 * Wave 6 Lot 3 — ONE call signature for `t()`, so a wrong call names its own
 * problem on the FIRST line.
 *
 * Under the three overloads a wrong call went one of two ways: TS2769 "No
 * overload matches this call" followed by the failure of EACH overload,
 * burying the one useful line — or a one-line TS2345 against the permissive
 * overload's key, which said nothing useful at all. On the CLASS that key was
 * `null`, so a forgotten required param printed "not assignable to parameter
 * of type 'null'"; a wrapper's `TranslateFn` carries no `| null`, so there the
 * same mistake read `'never'`. The before/after diagnostics are captured
 * verbatim in the root README's "Reading the type errors".
 *
 * `@ts-expect-error` can only assert THAT a call fails, and all of these
 * failed before too — the lot changed the MESSAGE, not the verdict — so the
 * block below is a preservation test. The one assertion that separates the two
 * designs is the PIN: `TranslateFn`'s namespaced overload accepted EVERY
 * namespace's bare keys, which made an unbound `t` satisfy the bound type. It
 * does not any more, because a bare key is now accepted only alongside the
 * namespace that declares it.
 */

import { createBoundTranslation, createI18n } from "@comvi/core";
import type {
  ArgsFor,
  NamespaceBoundTranslateFn,
  TranslateFn,
  TranslationParams,
} from "@comvi/core";

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

// Merges with translation-keys.test-d.ts's augmentation, which already closes
// `TranslationKeys` for this program. `farewell` is the parameterless default
// key the existing set lacks; the two namespaced entries give case 4 a second
// namespace to be wrong about.
declare module "@comvi/core" {
  interface TranslationKeys {
    farewell: never;
    "admin:dashboard": never;
    "admin:settings": { count: number };
    "shop:checkout": never;
  }
}

const i18n = createI18n({ locale: "en" });
const t = i18n.t.bind(i18n);

// Core has no `useI18n(ns)`; the bound narrowing it exports to the four
// wrappers is this type, so it is what the bound cases are read through.
declare const adminT: NamespaceBoundTranslateFn<"admin", {}, string>;

// CASE 1 — an unknown key. TS2345 naming the known keys, no overload list.
// @ts-expect-error `greting` is not a key
t("greting");

// CASE 2 — a required param forgotten. TS2554 "Expected 2 arguments, but got 1".
// @ts-expect-error `greeting` declares `formality` and `name`
t("greeting");

// CASE 3 — the wrong params. TS2345 whose second line names what is missing.
// @ts-expect-error `locale` is a routing option, not `formality` + `name`
t("greeting", { locale: "uk" });

// CASE 4 — a bound namespace is exact, and a key from another one is rejected
// on the KEY, naming what `admin` does accept. It used to report "Expected 2
// arguments, but got 1", which pointed at the params when the key was wrong.
adminT("dashboard");
adminT("settings", { count: 1 });
adminT("greeting", { formality: "formal", name: "Eugene" });
// @ts-expect-error `checkout` is not a key of `admin`
adminT("checkout");
// Still reachable the explicit way, which names the namespace that has it.
adminT("checkout", { ns: "shop" });

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

// `"ns:key"` is a registry spelling, not a call spelling: at runtime a colon is
// part of a literal key (tests/features/namespaces.test.ts), so the type must
// not accept a call that renders as a missing key.
// @ts-expect-error the qualified spelling is not a lookup form
t("admin:dashboard");
// @ts-expect-error the qualified spelling is not a lookup form
t("admin:settings", { count: 1 });
// @ts-expect-error the qualified spelling is not a lookup form
i18n.tRaw("admin:dashboard");

// Core's own extra, which a wrapper's `t` does not take.
t(null);
i18n.tRaw("greeting", { formality: "formal", name: "Eugene" });

// A key the call site could not narrow to ONE literal gets loose params, so
// none of these is checked. That is a known hole, not an oversight, and it is
// pinned here so the day it closes is deliberate: `docs/design/limitations.md`
// carries the user-facing note, and `48cf293` REJECTED all three (the union
// fell through to the permissive overload and reported "not assignable to
// parameter of type 'null'").
//
// Closing it needs the arms' params intersected, and doing that puts a second
// `{ ns }` inference site on the sibling branch of `ArgsFor`. `N` then falls
// back to its constraint and `t("dashboard", { ns: "shop" })` stops being
// checked against `shop`'s keys — a silent wrong-namespace accept, which is
// worse than an unchecked union key.
declare const cond: boolean;
t(cond ? "greeting" : "farewell");
t(cond ? "greeting" : "farewell", { totally: "bogus" });
t(cond ? "greeting" : "farewell", { formality: "formal", name: "Eugene" });

// What a union key must NOT do is widen the key set: an arm that is not a key
// at all is still rejected, on the key.
// @ts-expect-error `greting` is not a key on either arm
t(cond ? "greting" : "farewell");
// @ts-expect-error a qualified `"ns:key"` arm is not a lookup form
t(cond ? "admin:settings" : "shop:checkout");
// @ts-expect-error a qualified `"ns:key"` arm is not a lookup form
t(cond ? "farewell" : "admin:dashboard");

// `createBoundTranslation(i18n, ns)` narrows to `ns`'s keys, which is what its
// own `@example` documents. The namespace has to be a literal TypeScript can
// read; a `string` variable leaves the result unbound and loose, as before.
const boundAdmin = createBoundTranslation(i18n, "admin");
boundAdmin("dashboard");
boundAdmin("settings", { count: 1 });
boundAdmin("greeting", { formality: "formal", name: "Eugene" });
boundAdmin("checkout", { ns: "shop" });
// @ts-expect-error `checkout` is not a key of `admin`
boundAdmin("checkout");

const boundNone = createBoundTranslation(i18n);
boundNone("greeting", { formality: "formal", name: "Eugene" });
// @ts-expect-error a bare namespaced key still needs its namespace
boundNone("dashboard");

// `Parameters<typeof t>` is `never` once the registry is closed, and pinning
// that is the point: the key constraint mentions the inferred namespace `N`,
// and `Parameters`' `(...args: infer P)` cannot see through a constraint that
// references another type parameter. Removing `N` restores `Parameters` and
// takes the first-line key diagnostic with it, so this stays. Reach the
// argument list through `ArgsFor` instead, which resolves fine.
export type _ParametersIsNever = Expect<
  Equal<[Parameters<typeof t>] extends [never] ? true : false, true>
>;
export type _ArgsForResolves = Expect<Equal<ArgsFor<"farewell">, [params?: TranslationParams]>>;

// `t` is NOT assignable to a one-argument `(k: string) => string` callback
// with the registry closed: the key is a closed union and `string` is not one
// of its members. Hand such a helper `t as (k: string) => string`.
declare function stringKeyCallback(f: (k: string) => string): void;
// @ts-expect-error a closed key union does not accept `string`
stringKeyCallback(i18n.t);
stringKeyCallback(i18n.t as (k: string) => string);

export {};
