// REGRESSION PIN for the invariance defect: an instance carrying `defaultParams`
// must be passable to `I18nProvider`.
//
// `I18nCoreInstance` declares `setDefaultParams` as a property, so
// `strictFunctionTypes` makes the host INVARIANT in `D` and
// `createI18n({ defaultParams })` was not assignable to `WrapperI18nInstance<{}>`
// at all. Before the fix this file failed with:
//   TS2322: Type 'I18n<{ readonly formality: "formal"; }>' is not assignable
//   to type 'WrapperI18nInstance'.
import type { I18nProviderProps, WrapperI18nInstance } from "../../src/index";
import { createI18n, useI18nInstance } from "../../src/index";

const withDefaults = createI18n({
  locale: "en",
  defaultParams: { formality: "formal" as const },
});
export const _acceptsDefaultParamsInstance: I18nProviderProps["i18n"] = withDefaults;

// The plain host must keep working — the widening must not have cost anything.
const plain = createI18n({ locale: "en" });
export const _acceptsPlainInstance: I18nProviderProps["i18n"] = plain;

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// P2: `useI18nInstance()` is THE name for the bare host, typed as core's own
// `WrapperI18nInstance` — no loader/plugin members promised on it.
export type _UseI18nInstanceIsBare = Expect<
  Equal<ReturnType<typeof useI18nInstance>, WrapperI18nInstance>
>;

// P8: `AnyI18nInstance` is declared ONCE, in `@comvi/core`; this binding re-exports
// the same type rather than a copy of it.
export type _AnyI18nInstanceIsCores = Expect<
  Equal<import("../../src/context").AnyI18nInstance, import("@comvi/core").AnyI18nInstance>
>;
