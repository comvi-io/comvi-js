// REGRESSION PIN for the invariance defect: an instance carrying `defaultParams`
// must be passable to `I18nProvider`.
//
// `I18nCoreInstance` declares `setDefaultParams` as a property, so
// `strictFunctionTypes` makes the host INVARIANT in `D` and
// `createI18n({ defaultParams })` was not assignable to `WrapperI18nHost<{}>`
// at all. Before the fix this file failed with:
//   TS2322: Type 'I18n<{ readonly formality: "formal"; }>' is not assignable
//   to type 'WrapperI18nHost'.
import type { I18nProviderProps } from "../../src/index";
import { createI18n } from "../../src/index";

const withDefaults = createI18n({
  locale: "en",
  defaultParams: { formality: "formal" as const },
});
export const _acceptsDefaultParamsHost: I18nProviderProps["i18n"] = withDefaults;

// The plain host must keep working — the widening must not have cost anything.
const plain = createI18n({ locale: "en" });
export const _acceptsPlainHost: I18nProviderProps["i18n"] = plain;
