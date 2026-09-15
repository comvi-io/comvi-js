/**
 * THE CONTRACT BEHIND GENERATED TYPES: a declaration file that augments THIS
 * package reaches `t()`.
 *
 * `@comvi/typegen` writes `declare module '@comvi/<what the app declares>'`,
 * because the documented install is a single package and `@comvi/core` arrives
 * through it as a transitive dependency no strict pnpm layout or Yarn PnP app
 * can name. `t()`'s key type reads `TranslationKeys` as `@comvi/core` declares
 * it, so the block below has to merge into core's interface through this
 * package's re-export of it.
 *
 * It is a two-sided assertion. A declared key must compile, and an undeclared
 * one must not: if the merge did NOT happen, `t` keeps taking any string, the
 * `@ts-expect-error` below goes unused and TypeScript fails this file with
 * TS2578. Changing this package's re-export of `TranslationKeys` breaks it.
 *
 * Its own program (`tsconfig.keys-via-binding.json`): a `declare module` block
 * is global to whichever program contains it.
 */

import type { I18n } from "@comvi/react";

declare module "@comvi/react" {
  interface TranslationKeys {
    greeting: { name: string };
    farewell: never;
  }
}

/**
 * A function body, never called: some packages run `.test-d.ts` files through
 * vitest's runtime as well, and a top-level `declare const` would be a
 * ReferenceError there. Type-checking is the whole point of the file.
 */
export function keysReachTranslate(i18n: I18n): void {
  i18n.t("farewell");
  i18n.t("greeting", { name: "Ada" });

  // @ts-expect-error `missing` is not one of the declared keys
  i18n.t("missing");
}
