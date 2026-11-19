/**
 * A double of the session's write-back for suites whose subject is what `useTranslations`
 * computes for a save (ICU rebuilding, sessions, scopes), not which pairs get patched: the
 * patch is recorded in the `{ "locale:ns": { key: value } }` shape those suites assert.
 * Which pairs the real session patches is `tests/save-local-patch.test.ts`, on a real core.
 * Imports nothing from `src/` at runtime, so a `vi.mock` factory can load it.
 */
import type { Target } from "../../src/adapter";

/** The instance a test save writes back into; its contents are never read by the double. */
export const TEST_TARGET = { inst: "" } as unknown as Target;

export function sessionWritingTo(
  addMessages: (update: Record<string, Record<string, string>>) => void,
) {
  return {
    patch(_target: Target, ns: string, key: string, byLocale: Record<string, string>): void {
      addMessages(
        Object.fromEntries(Object.entries(byLocale).map(([l, v]) => [`${l}:${ns}`, { [key]: v }])),
      );
    },
  };
}
