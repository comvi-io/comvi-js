/**
 * Wave 6 Lot 3, CASE 5 — an app with no generated types must keep compiling.
 *
 * `PermissiveKey` is `string` while `TranslationKeys` is empty and `never`
 * afterwards, which is what widens `AcceptedKey` to `string` and makes
 * `ArgsFor` hand back loose params. Replacing the three overloads with one
 * signature could have lost that in either direction — a key union that no
 * longer widens, or params that stay required — so this program keeps the
 * registry OPEN and asserts the untyped path directly.
 *
 * This program is already keys-OPEN, and stays that way: `declare module
 * "@comvi/core"` is global to whichever program contains it, so a single
 * augmentation anywhere here would close the registry for every file in it.
 * nuxt's closed-registry assertions live in `tests/types-keys-closed/`, a
 * second program.
 *
 * Shaped as `describe`/`it` because nuxt runs `*.test-d.ts` under plain
 * `vitest run` as well as under `--typecheck.only`, and a file with no suite
 * fails collection there.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { ServerTranslationFunction } from "../src/runtime/server/utils/useTranslation";

// A real runtime value, not `declare const`: nuxt runs `*.test-d.ts` under
// plain `vitest run` too, so an `it()` body that CALLS `t` executes, and a
// declaration-only binding is a ReferenceError there.
const t = ((): string => "") as unknown as ServerTranslationFunction;

describe("server t() with no generated types", () => {
  it("widens its key parameter to string", () => {
    expectTypeOf<Parameters<ServerTranslationFunction>[0]>().toEqualTypeOf<string>();
  });

  it("takes any key with loose params, and needs no second argument", () => {
    t("anything", { any: 1 });
    t("anything");
    t("some.nested.key", { count: 2, locale: "uk", ns: "admin" });
  });
});
