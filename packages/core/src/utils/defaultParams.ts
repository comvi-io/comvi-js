import type { DefaultTranslationParams } from "../types";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const RESERVED_DEFAULT_PARAM_KEYS = ["locale", "ns", "fallback", "raw", "tagInterpolation"] as const;
const ERR_RESERVED_DEFAULT_PARAMS = IS_DEV
  ? "[i18n] defaultParams cannot contain call-control keys: locale, ns, fallback, raw, tagInterpolation"
  : "E_RESERVED_DEFAULT_PARAMS";
const ERR_NULLISH_DEFAULT_PARAMS = IS_DEV
  ? "[i18n] defaultParams values cannot be null or undefined"
  : "E_NULLISH_DEFAULT_PARAMS";

/** Validate that defaults contain interpolation values only. */
export function assertInterpolationDefaults(params: DefaultTranslationParams | undefined): void {
  if (params === undefined) return;
  for (const key of RESERVED_DEFAULT_PARAM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(ERR_RESERVED_DEFAULT_PARAMS);
    }
  }
  for (const value of Object.values(params)) {
    if (value == null) {
      throw new Error(ERR_NULLISH_DEFAULT_PARAMS);
    }
  }
}

/** Enforce keys guaranteed by the instance's constructor type. */
export function assertPreservesDefaultParamKeys(
  params: DefaultTranslationParams | undefined,
  guaranteedKeys: readonly string[],
): void {
  for (const key of guaranteedKeys) {
    if (
      params == null ||
      !Object.prototype.hasOwnProperty.call(params, key) ||
      params[key] == null
    ) {
      throw new Error(
        IS_DEV
          ? `[i18n] defaultParams must preserve constructor-guaranteed key "${key}"`
          : "E_DEFAULT_PARAMS_GUARANTEED_KEY",
      );
    }
  }
}
