// `useI18n()` is type-honest by ABSENCE: the loader/plugin members are
// not on its return, in types or at runtime, in any build. They are acquired
// here instead, behind one call per capability that verifies the instance
// STRUCTURALLY and throws when the capability was never attached — in dev AND
// in prod. There is no silent no-op and no dev-only tombstone.
//
// These are CONTEXT READERS, not stores: they call `useI18nInstance()`, so —
// exactly like `useI18n()` — they are callable during component initialisation
// only, and what they return is a plain object of bound functions captured at
// that moment. Nothing here is reactive and `$`-prefixing a member is a type
// error. The asymmetry with `createLocaleStore()` & friends is deliberate: a
// capability action is an imperative operation, not a value that changes.
//
// Naming: `useI18nLoader` / `useI18nPlugins` rather than a svelte-flavoured
// `getI18nLoader`, so one grep finds the same API across all four wrappers.
//
// The acquisition itself is CORE's: `acquireLoaderApi` / `acquirePluginsApi`
// on `@comvi/core/loader` / `@comvi/core/plugins`, one implementation the four
// bindings share, including the identity contract (one bag per instance, cached in
// a module-level `WeakMap` in core, so members are referentially stable per
// instance across components). Only the instance acquisition below is svelte's.
import { acquireLoaderApi } from "@comvi/core/loader";
import { acquirePluginsApi } from "@comvi/core/plugins";
import type { AcquiredLoaderApi } from "@comvi/core/loader";
import type { AcquiredPluginsApi } from "@comvi/core/plugins";
import { useI18nInstance } from "./context.js";

/** What `useI18nLoader()` returns — core's acquired loader surface. */
export type UseI18nLoaderReturn = AcquiredLoaderApi;

/** What `useI18nPlugins()` returns — core's acquired plugin surface. */
export type UseI18nPluginsReturn = AcquiredPluginsApi;

/**
 * Acquire the loader capability of the instance in svelte context.
 *
 * Call during component initialisation, like `useI18n()`. Throws
 * `missingCapability("loader")` — in dev and in prod — when the instance is a base
 * `@comvi/core` instance, which is every instance nobody composed a loader onto.
 * The capability ships in `@comvi/core/loader` and nowhere else, so compose it
 * where the instance is created: `createI18n(...).use(attachLoader)`, or the
 * lower-level `attachLoader(createI18n(...))`.
 *
 * @example
 * ```svelte
 * <script>
 *   import { useI18nLoader } from '@comvi/svelte';
 *
 *   const { addActiveNamespace } = useI18nLoader();
 * </script>
 *
 * <button onclick={() => addActiveNamespace('admin')}>load admin</button>
 * ```
 */
export function useI18nLoader(): UseI18nLoaderReturn {
  return acquireLoaderApi(useI18nInstance());
}

/**
 * Acquire the plugin capability of the instance in svelte context.
 *
 * Call during component initialisation, like `useI18n()`. Throws
 * `missingCapability("plugins")` — in dev and in prod — when the instance is the
 * base one `@comvi/svelte`'s `createI18n` builds.
 *
 * @example
 * ```svelte
 * <script>
 *   import { onDestroy } from 'svelte';
 *   import { useI18nPlugins } from '@comvi/svelte';
 *
 *   const { onMissingKey } = useI18nPlugins();
 *   onDestroy(onMissingKey((key) => `[${key}]`));
 * </script>
 * ```
 */
export function useI18nPlugins(): UseI18nPluginsReturn {
  return acquirePluginsApi(useI18nInstance());
}
