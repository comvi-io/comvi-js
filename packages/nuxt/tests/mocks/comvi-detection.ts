import type { ResolveAcceptLanguage } from "../../src/types";

/**
 * Stand-in for the build-time `#build/comvi.detection` template (src/module.ts):
 * the app's `localeDetection.resolveAcceptLanguage`, or `undefined`.
 */
export let resolveAcceptLanguage: ResolveAcceptLanguage | undefined;

export function setCustomResolveAcceptLanguage(fn: ResolveAcceptLanguage | undefined) {
  resolveAcceptLanguage = fn;
}
