/**
 * Declarations of the two commands: `setLocale()` and `load()` resolve with the failure or
 * nothing, `Promise<Error | undefined>`, on the instance and on the handover's switch (`Core.L`,
 * what `<I18nHandover locale>` of `@comvi/react` calls). Checked by `pnpm typecheck`
 * (tsconfig.tests.json): a declaration that drifts fails to compile here. `ready` stays
 * `Promise<void>`.
 */
import { expect, it } from "vitest";
import type { Core, I18n } from "../../src/instance";

/** `true` only when A and B are the same type (not merely assignable either way). */
type Same<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;

export const pinned: [
  Same<ReturnType<I18n["setLocale"]>, Promise<Error | undefined>>,
  Same<ReturnType<I18n["load"]>, Promise<Error | undefined>>,
  Same<ReturnType<Core["L"]>, Promise<Error | undefined>>,
  Same<I18n["ready"], Promise<void>>,
] = [true, true, true, true];

it("the declarations compile (the check itself is tsc's)", () => {
  expect(pinned).toEqual([true, true, true, true]);
});
