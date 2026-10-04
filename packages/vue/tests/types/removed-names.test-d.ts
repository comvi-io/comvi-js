// 0.5 is a new library: a name that left the public API is GONE — no
// `?: never` placeholder, no alias, no `@deprecated` re-export. Each assertion
// below fails the moment one of these names is declared again, in any shape.
import type { UseI18nReturn, VueI18n } from "../../src/index";
import { T } from "../../src/index";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type MovedOffUseI18n = "addActiveNamespace" | "reloadMessages" | "onLoadError" | "onMissingKey";
// `useI18nLoader()` / `useI18nPlugins()` own these; `UseI18nReturn` declares none of them.
export type _NoMovedKeys = Expect<Equal<Extract<keyof UseI18nReturn, MovedOffUseI18n>, never>>;

// `hasTranslation` / `hasLocale` are the composable's pair; the imperative
// `*Now` pair lives on the `VueI18n` class only.
export type _NoNowPairOnTheComposable = Expect<
  Equal<Extract<keyof UseI18nReturn, "hasTranslationNow" | "hasLocaleNow">, never>
>;
export function _theClassHasTheNowPair(i18n: VueI18n): [boolean, boolean] {
  return [i18n.hasTranslationNow("greeting"), i18n.hasLocaleNow("en")];
}

// `skipPostProcess` is the prop. `raw` is not declared, so it falls into the
// interpolation-param widening like any other undeclared key: any value types.
type TProps = InstanceType<typeof T>["$props"];
export const _rawIsJustAParam: TProps = { i18nKey: "greeting", raw: "a param value" };
