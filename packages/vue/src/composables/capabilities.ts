// `useI18n()` is type-honest by ABSENCE: the loader/plugin-host members are
// not on its return, in types or at runtime, in any build. They are acquired
// here instead, behind one call per capability that verifies the injected
// instance's `core` STRUCTURALLY and throws when the capability was never
// attached — in dev AND in prod. There is no silent no-op and no dev-only
// tombstone.
//
// The acquisition itself is CORE's: `acquireLoaderApi` / `acquirePluginsApi`
// on `@comvi/core/loader` / `@comvi/core/plugins`, one implementation the four
// bindings share, including the identity contract (one bag per host, cached in
// a module-level `WeakMap` in core, so two components under one app receive
// the same function references). Only `injectHost` below is vue's.
import { inject } from "vue";
import { acquireLoaderApi } from "@comvi/core/loader";
import { acquirePluginsApi } from "@comvi/core/plugins";
import type { AcquiredLoaderApi } from "@comvi/core/loader";
import type { AcquiredPluginsApi } from "@comvi/core/plugins";
import type { WrapperI18nHost } from "@comvi/core";
import { I18N_INJECTION_KEY } from "../keys";

/** What `useI18nLoader()` returns — core's acquired loader surface. */
export type UseI18nLoaderReturn = AcquiredLoaderApi;

/** What `useI18nPlugins()` returns — core's acquired plugin-host surface. */
export type UseI18nPluginsReturn = AcquiredPluginsApi;

/**
 * The vue-specific half of the acquisition: the host is the injected
 * instance's `core`, and a composable used outside an installed app has its
 * own error before any capability check can be meaningful.
 */
function injectHost(composable: string): WrapperI18nHost {
  const injected = inject(I18N_INJECTION_KEY);

  if (!injected) {
    throw new Error(
      `[@comvi/vue] ${composable} must be used within a Vue app with i18n plugin installed. ` +
        "Make sure you called app.use(i18n) before using this composable.",
    );
  }

  return injected.core;
}

/**
 * Acquire the loader capability of the installed i18n instance's core.
 *
 * Throws `missingCapability("loader")` — in dev and in prod — when the core is
 * a base `@comvi/core` instance, which is every host nobody composed a loader
 * onto. The capability ships in `@comvi/core/loader` and nowhere else, so
 * compose it where the instance is created: `createI18n(...).use(attachLoader)`,
 * or the lower-level `attachLoader(createI18n(...))`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { addActiveNamespace } = useI18nLoader();
 * await addActiveNamespace("admin");
 * </script>
 * ```
 */
export function useI18nLoader(): UseI18nLoaderReturn {
  return acquireLoaderApi(injectHost("useI18nLoader"));
}

/**
 * Acquire the plugin-host capability of the installed i18n instance's core.
 *
 * Throws `missingCapability("plugins")` — in dev and in prod — when the core
 * is a bare `@comvi/core` instance.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { onMissingKey } = useI18nPlugins();
 * onScopeDispose(onMissingKey((key) => `[${key}]`));
 * </script>
 * ```
 */
export function useI18nPlugins(): UseI18nPluginsReturn {
  return acquirePluginsApi(injectHost("useI18nPlugins"));
}
