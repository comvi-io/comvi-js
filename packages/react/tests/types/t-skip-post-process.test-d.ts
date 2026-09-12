/**
 * `<T>`'s `raw` prop was renamed to `skipPostProcess` in 0.5; `raw` stays as a
 * deprecated alias for one release. Both must type-check.
 *
 * `admin:dashboard` is declared with no required params by
 * `namespace-bound.test-d.ts`, which (with `default-params.test-d.ts`) closes
 * `TranslationKeys` for this whole test-types program — see that file's note.
 *
 * The probes are object-literal ANNOTATIONS on purpose: excess-property
 * checking is what proves each key is legal on `TProps`.
 */
import type { TProps } from "../../src/T";

export const _skipPostProcess: TProps = {
  i18nKey: "admin:dashboard",
  skipPostProcess: true,
};

// @deprecated, but still a valid prop for one release.
export const _deprecatedRaw: TProps = {
  i18nKey: "admin:dashboard",
  raw: true,
};

export const _bothAccepted: TProps = {
  i18nKey: "admin:dashboard",
  skipPostProcess: true,
  raw: false,
};
