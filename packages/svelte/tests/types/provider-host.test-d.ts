// REGRESSION PIN for the invariance defect: an instance carrying `defaultParams`
// must be passable to `setI18nContext`.
//
// `I18nCoreInstance` declares `setDefaultParams` as a property, so
// `strictFunctionTypes` makes the host INVARIANT in `D` and
// `createI18n({ defaultParams })` was not assignable to `WrapperI18nHost<{}>`
// at all. Before the fix this file failed with:
//   TS2345: Argument of type 'I18n<{ readonly formality: "formal"; }>' is not
//   assignable to parameter of type 'Host'.
import { createI18n } from "../../src/index";
import { setI18nContext } from "../../src/context";

const withDefaults = createI18n({
  locale: "en",
  defaultParams: { formality: "formal" as const },
});
setI18nContext(withDefaults, { autoInit: false });

// The plain host must keep working — the widening must not have cost anything.
setI18nContext(createI18n({ locale: "en" }), { autoInit: false });
