/**
 * `setDefaultParams` is reached through the wrapper's `Host` alias, so it is
 * the one member of `UseI18nReturn<D>` that can lose `D` to a non-generic
 * alias without any other signature noticing. It did: the alias was declared
 * as `WrapperI18nInstance` (default `D = {}`), which accepts ANY replacement bag.
 * These directives are the gate — the negatives must stay errors.
 */
import type { UseI18nReturn } from "../../src/index";

// NOTE: this augmentation closes `TranslationKeys` for the whole test-types
// program (all tests/types/*.test-d.ts compile together), as svelte's
// t-direct-props.test-d.ts documents for its own program.
declare module "@comvi/core" {
  interface TranslationKeys {
    review: { formality: "formal" | "informal" };
    greeting: { formality: "formal" | "informal"; name: string };
  }
}

type Defaults = { formality: "formal" | "informal" };
declare const scoped: UseI18nReturn<Defaults>;

scoped.t("review");
scoped.t("review", { formality: "informal" });
scoped.t("greeting", { name: "Eugene" });

// @ts-expect-error missing non-defaulted parameter
scoped.t("greeting");
// @ts-expect-error defaulted parameter keeps the generated value type
scoped.t("review", { formality: 123 });

scoped.tRaw("review");
// @ts-expect-error defaulted parameter keeps the generated value type
scoped.tRaw("review", { formality: 123 });

// A replacement bag must preserve every constructor-guaranteed key. The
// runtime throws E_DEFAULT_PARAMS_GUARANTEED_KEY on all three of these, so
// the compile error is the only thing standing between a caller and a crash.
scoped.setDefaultParams({ formality: "informal" });
// @ts-expect-error an empty object drops the guaranteed default key
scoped.setDefaultParams({});
// @ts-expect-error undefined drops the guaranteed default key
scoped.setDefaultParams(undefined);
// @ts-expect-error runtime replacements preserve the declared default type
scoped.setDefaultParams({ formality: 123 });

// The unscoped default (`D = {}`) guarantees no key, so it keeps accepting both.
declare const unscoped: UseI18nReturn;
unscoped.setDefaultParams({});
unscoped.setDefaultParams(undefined);
