// D″ tombstones (wave 4). The members that LEFT `useI18n()` in 0.5 are
// re-declared `?: never` on `UseI18nReturn`, so a 0.4 destructure is a type
// error that NAMES the acquisition in its tooltip instead of the bare
// "Property does not exist". Each `@ts-expect-error` below pins the `never`:
// it fails the build the moment one of these becomes callable again, which is
// what a well-meant "put it back" would do.
//
// That a tombstone EXISTS, and its exact tooltip text, is asserted for all
// four bindings at once by `scripts/wrapper-hooks-parity.test.mjs` — a
// directive here cannot see the difference between `?: never` and a member
// that was deleted outright, since both make the call an error.
import type { UseI18nReturn, VueI18n } from "../../src/index";

export function _tombstonesAreTypeErrors(bag: UseI18nReturn): void {
  // @ts-expect-error Moved in 0.5: `const { addActiveNamespace } = useI18nLoader()`.
  bag.addActiveNamespace("admin");
  // @ts-expect-error Moved in 0.5: `const { reloadTranslations } = useI18nLoader()`.
  bag.reloadTranslations();
  // @ts-expect-error Moved in 0.5: `const { onLoadError } = useI18nLoader()`.
  bag.onLoadError(() => {});
  // @ts-expect-error Moved in 0.5: `const { onMissingKey } = useI18nPlugins()`.
  bag.onMissingKey(() => "fallback");
}

// Q6: the *Now pair left vue's `useI18n()` — `hasTranslation` / `hasLocale`
// are already the non-reactive form in the other three bindings — and stays on
// the `VueI18n` class, which the assertions below pin from both sides.

export function _nowPairLeftTheComposable(bag: UseI18nReturn): void {
  // @ts-expect-error Moved in 0.5: `inject(I18N_INJECTION_KEY).hasTranslationNow`.
  bag.hasTranslationNow("greeting");
  // @ts-expect-error Moved in 0.5: `inject(I18N_INJECTION_KEY).hasLocaleNow`.
  bag.hasLocaleNow("en");
}

export function _theClassStillHasTheNowPair(i18n: VueI18n): [boolean, boolean] {
  return [i18n.hasTranslationNow("greeting"), i18n.hasLocaleNow("en")];
}
