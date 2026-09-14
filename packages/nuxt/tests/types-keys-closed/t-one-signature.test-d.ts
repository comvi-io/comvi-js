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
 * `@ts-expect-error` can only assert THAT a call fails, and all of these
 * failed before too — the lot changed the MESSAGE, not the verdict — so the
 * block below is a preservation test. The one assertion that separates the two
 * designs is the PIN: `TranslateFn`'s namespaced overload accepted EVERY
 * namespace's bare keys, which made an unbound `t` satisfy the bound type. It
 * does not any more, because a bare key is now accepted only alongside the
 * namespace that declares it.
 *
 * `@comvi/nuxt`'s server `t` binds a namespace at RUNTIME
 * (`useTranslation(event, { namespace })`) but not in its TYPE, so core owns
 * the bound-namespace probe; what is checked here is the explicit `{ ns }`
 * form.
 *
 * Shaped as `describe`/`it` because nuxt runs `*.test-d.ts` under plain
 * `vitest run` as well as under `--typecheck.only`, and a file with no suite
 * fails collection there.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { NamespaceBoundTranslateFn, TranslateFn } from "@comvi/core";
import type { ServerTranslationFunction } from "../../src/runtime/server/utils/useTranslation";

declare module "@comvi/core" {
  interface TranslationKeys {
    greeting: { formality: "formal" | "informal"; name: string };
    farewell: never;
    "admin:dashboard": never;
    "admin:settings": { count: number };
    "shop:checkout": never;
  }
}

// A real runtime value, not `declare const`: nuxt runs `*.test-d.ts` under
// plain `vitest run` too, so an `it()` body that CALLS `t` executes, and a
// declaration-only binding is a ReferenceError there.
const t = ((): string => "") as unknown as ServerTranslationFunction;

describe("server t() has one call signature", () => {
  it("does not let an unbound t stand in for a namespace-bound one", () => {
    // Under the overload set both accepted every namespace's bare keys, so
    // this was assignable. A bare key now needs the namespace that has it.
    expectTypeOf<
      TranslateFn<{}, string> extends NamespaceBoundTranslateFn<"admin", {}, string> ? true : false
    >().toEqualTypeOf<false>();
  });

  it("rejects the first-run mistakes, each on its own first line", () => {
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
  });

  it("still accepts and still rejects exactly what the overload set did", () => {
    t("farewell");
    t("farewell", { locale: "uk" });
    t("greeting", { formality: "formal", name: "Eugene" });
    t("greeting", { formality: "formal", name: "Eugene", extra: 1 });

    // @ts-expect-error a bare namespaced key is not accepted without its namespace
    t("dashboard");
    // @ts-expect-error the server `t` does not take the qualified spelling
    t("admin:dashboard");
    // @ts-expect-error a generated param keeps its value type
    t("greeting", { formality: "nope", name: "Eugene" });
  });
});
