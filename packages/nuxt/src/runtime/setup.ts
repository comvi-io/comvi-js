import type { NuxtI18nSetup } from "../types";

/**
 * Helper for defining `comvi.setup` with full type inference.
 *
 * Import from `@comvi/nuxt/runtime/setup` in runtime files.
 */
export function defineComviSetup(setup: NuxtI18nSetup): NuxtI18nSetup {
  return setup;
}
