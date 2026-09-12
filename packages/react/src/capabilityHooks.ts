// `useI18n()` is type-honest by ABSENCE: the loader/plugin-host members are
// not on its return, in types or at runtime, in any build. They are acquired
// here instead, behind one call per capability that verifies the host
// STRUCTURALLY and throws when the capability was never attached — in dev AND
// in prod. There is no silent no-op and no dev-only tombstone.
//
// The acquisition itself is CORE's: `acquireLoaderApi` / `acquirePluginsApi`
// on `@comvi/core/loader` / `@comvi/core/plugins`, one implementation the four
// bindings share, including the identity contract (one bag per host, cached in
// a module-level `WeakMap` in core, deliberately NOT a react-local `useMemo`,
// so two components under one provider receive the same function references).
// Only the host acquisition below is react's.
import { acquireLoaderApi } from "@comvi/core/loader";
import { acquirePluginsApi } from "@comvi/core/plugins";
import type { AcquiredLoaderApi } from "@comvi/core/loader";
import type { AcquiredPluginsApi } from "@comvi/core/plugins";
import { useI18nHost } from "./I18nProvider";

/** What `useI18nLoader()` returns — core's acquired loader surface. */
export type UseI18nLoaderReturn = AcquiredLoaderApi;

/** What `useI18nPlugins()` returns — core's acquired plugin-host surface. */
export type UseI18nPluginsReturn = AcquiredPluginsApi;

/**
 * Acquire the loader capability of the host provided by `<I18nProvider>`.
 *
 * Throws `missingCapability("loader")` — in dev and in prod — when the host is
 * a base `@comvi/core` instance, which is every host nobody composed a loader
 * onto. The capability ships in `@comvi/core/loader` and nowhere else, so
 * compose it where the instance is created: `createI18n(...).use(attachLoader)`,
 * or the lower-level `attachLoader(createI18n(...))`.
 *
 * @example
 * ```tsx
 * function NamespaceLoader() {
 *   const { addActiveNamespace } = useI18nLoader();
 *   useEffect(() => void addActiveNamespace("dashboard"), [addActiveNamespace]);
 * }
 * ```
 */
export function useI18nLoader(): UseI18nLoaderReturn {
  return acquireLoaderApi(useI18nHost());
}

/**
 * Acquire the plugin-host capability of the host provided by `<I18nProvider>`.
 *
 * Throws `missingCapability("plugins")` — in dev and in prod — when the host
 * is a bare `@comvi/core` instance.
 *
 * @example
 * ```tsx
 * function MissingKeyReporter() {
 *   const { onMissingKey } = useI18nPlugins();
 *   useEffect(() => onMissingKey((key) => `[${key}]`), [onMissingKey]);
 * }
 * ```
 */
export function useI18nPlugins(): UseI18nPluginsReturn {
  return acquirePluginsApi(useI18nHost());
}
