// `useI18n()` is type-honest by ABSENCE: the loader/plugin-host members are
// not on its return, in types or at runtime, in any build. They are acquired
// here instead, behind one call per capability that verifies the host
// STRUCTURALLY and throws when the capability was never attached — in dev AND
// in prod. There is no silent no-op and no dev-only tombstone.
//
// Solid idiom: plain accessors under the Provider, NO signals — a capability
// action is an imperative operation, not a reactive value, and the returned
// members are bound host methods with nothing to track. They read the context
// exactly like `useI18nHost()` does, so the same rule applies: call them in
// a component/owner scope.
//
// The acquisition itself is CORE's: `acquireLoaderApi` / `acquirePluginsApi`
// on `@comvi/core/loader` / `@comvi/core/plugins`, one implementation the four
// bindings share, including the identity contract (one bag per host, cached in
// a module-level `WeakMap` in core, so members are referentially stable per
// host across components). Only the host acquisition below is solid's.
import { acquireLoaderApi } from "@comvi/core/loader";
import { acquirePluginsApi } from "@comvi/core/plugins";
import type { AcquiredLoaderApi } from "@comvi/core/loader";
import type { AcquiredPluginsApi } from "@comvi/core/plugins";
import { useI18nHost } from "./context";

/** What `useI18nLoader()` returns — core's acquired loader surface. */
export type UseI18nLoaderReturn = AcquiredLoaderApi;

/** What `useI18nPlugins()` returns — core's acquired plugin surface. */
export type UseI18nPluginsReturn = AcquiredPluginsApi;

/**
 * Acquire the loader capability of the instance provided by `<I18nProvider>`.
 *
 * Throws `missingCapability("loader")` — in dev and in prod — when the instance is
 * a base `@comvi/core` instance, which is every instance nobody composed a loader
 * onto. The capability ships in `@comvi/core/loader` and nowhere else, so
 * compose it where the instance is created: `createI18n(...).use(attachLoader)`,
 * or the lower-level `attachLoader(createI18n(...))`.
 *
 * @example
 * ```tsx
 * function NamespaceLoader() {
 *   const { addActiveNamespace } = useI18nLoader();
 *   onMount(() => void addActiveNamespace("dashboard"));
 * }
 * ```
 */
export function useI18nLoader(): UseI18nLoaderReturn {
  return acquireLoaderApi(useI18nHost());
}

/**
 * Acquire the plugin capability of the instance provided by `<I18nProvider>`.
 *
 * Throws `missingCapability("plugins")` — in dev and in prod — when the instance
 * is the base instance `@comvi/solid`'s `createI18n` builds.
 *
 * @example
 * ```tsx
 * function MissingKeyReporter() {
 *   const { onMissingKey } = useI18nPlugins();
 *   onCleanup(onMissingKey((key) => `[${key}]`));
 * }
 * ```
 */
export function useI18nPlugins(): UseI18nPluginsReturn {
  return acquirePluginsApi(useI18nHost());
}
