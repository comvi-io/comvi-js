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
export type _NoGetI18nContext = Expect<
  Equal<"getI18nContext" extends keyof typeof rootEntry ? true : false, false>
>;

// `skipPostProcess` is the prop; tag handlers come from `components`. Neither
// `raw` nor `allowedTags` is declared, so each falls into the
// interpolation-param widening like any other undeclared key.
export type _RawIsJustAParam = Expect<Equal<TProps["raw"], unknown>>;
export type _AllowedTagsIsJustAParam = Expect<Equal<TProps["allowedTags"], unknown>>;
