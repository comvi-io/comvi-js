/**
 * `<T markers={false}>` keeps the in-context editor's invisible markers out of the result.
 *
 * `admin:dashboard` is declared with no required params by
 * `namespace-bound.test-d.ts`, which (with `default-params.test-d.ts`) closes
 * `TranslationKeys` for this whole test-types program — see that file's note.
 *
 * The probe is an object-literal ANNOTATION on purpose: excess-property
 * checking is what proves the key is legal on `TProps`.
 */
import type { TProps } from "../../src/T";

export const _markers: TProps = {
  i18nKey: "admin:dashboard",
  markers: false,
};
