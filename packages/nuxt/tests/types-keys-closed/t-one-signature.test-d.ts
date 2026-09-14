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
 * `@ts-expect-error` can only assert THAT a call fails, and all of these failed
 * before too, so the accept/reject block is a preservation test: the lot
 * changed the MESSAGE, not the verdict. What pins the overload set as gone is
 * the `Parameters<…>` assertion, which resolved to the LAST signature — the
 * permissive one, whose key is `never` once the registry is closed.
 *
 * `@comvi/nuxt`'s server `t` binds a namespace at RUNTIME
 * (`useTranslation(event, { namespace })`) but not in its TYPE, so there is no
 * bound-namespace signature to read here — case 4 is the explicit `{ ns }`
 * form, and core owns the bound-namespace probe.
 *
 * Shaped as `describe`/`it` because nuxt runs `*.test-d.ts` under plain
 * `vitest run` as well as under `--typecheck.only`, and a file with no suite
 * fails collection there.
 */
import { describe, it, expectTypeOf } from "vitest";
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
  it("takes the whole union of accepted keys, not the permissive overload's never", () => {
    expectTypeOf<Parameters<ServerTranslationFunction>[0]>().toEqualTypeOf<
      "greeting" | "farewell" | "dashboard" | "settings" | "checkout"
    >();
  });

  it("rejects the five first-run mistakes, each on its own first line", () => {
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
    t("dashboard", { ns: "admin" });

    // @ts-expect-error a bare namespaced key still has to name its namespace
    t("dashboard");
    // @ts-expect-error a wrapper's `t` does not take the qualified spelling
    t("admin:dashboard");
    // @ts-expect-error a generated param keeps its value type
    t("greeting", { formality: "nope", name: "Eugene" });
  });
});
