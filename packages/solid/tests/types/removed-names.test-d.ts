// 0.5 is a new library: a name that left the public API is GONE — no
// `?: never` placeholder, no alias, no `@deprecated` re-export. Each assertion
// below fails the moment one of these names is declared again, in any shape.
import type { TProps, UseI18nReturn } from "../../src/index";
import * as rootEntry from "../../src/index";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type MovedOffUseI18n = "addActiveNamespace" | "reloadMessages" | "onLoadError" | "onMissingKey";
// `useI18nLoader()` / `useI18nPlugins()` own these; `UseI18nReturn` declares none of them.
export type _NoMovedKeys = Expect<Equal<Extract<keyof UseI18nReturn, MovedOffUseI18n>, never>>;

// The host is `useI18nInstance()`, the one name react, solid and svelte share.
export type _NoUseI18nContext = Expect<
  Equal<"useI18nContext" extends keyof typeof rootEntry ? true : false, false>
>;

// `skipPostProcess` is the prop. `raw` is not declared, so it falls into the
// interpolation-param widening like any other undeclared key.
export type _RawIsJustAParam = Expect<Equal<TProps["raw"], unknown>>;
