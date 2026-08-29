// `useI18n()` is type-honest by ABSENCE: the loader/plugin-host members are
// not on its return, in types or at runtime, in any build. They live here
// instead, behind one acquisition call per capability that verifies the host
// STRUCTURALLY and throws when the capability was never attached — in dev AND
// in prod. There is no silent no-op and no dev-only tombstone.
//
// These are CONTEXT READERS, not stores: they call `getI18nContext()`, so —
// exactly like `useI18n()` — they are callable during component initialisation
// only, and what they return is a plain object of bound functions captured at
// that moment. Nothing here is reactive and `$`-prefixing a member is a type
// error. The asymmetry with `createLocaleStore()` & friends is deliberate: a
// capability action is an imperative operation, not a value that changes.
//
// Naming: `useI18nLoader` / `useI18nPlugins` rather than a svelte-flavoured
// `getI18nLoader`, so one grep finds the same API across all four wrappers.
//
// Identity contract: the bag is cached in a module-level `WeakMap<host, bag>`,
// so members are referentially stable per host across components.
import { hasLoaderApi, hasPluginHostApi, missingCapability } from "@comvi/core";
import type { I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "@comvi/core";
import { getI18nContext } from "./context.js";

// #region capability-parity (B8) — FRAMEWORK-NEUTRAL, BYTE-IDENTICAL
// Everything between the region markers is the same text in @comvi/react,
// @comvi/vue, @comvi/solid and @comvi/svelte, character for character, and
// `scripts/wrapper-hooks-parity.test.mjs` fails if it drifts. The copies did
// drift once: react wrapped the `onMissingKey` callback in a `String(result)`
// coercion the other three did not have. Only the host acquisition below the
// region may differ per framework.
//
// TODO: move the region into `@comvi/core` as `acquireLoaderApi(host)` /
// `acquirePluginsApi(host)`, then delete the four copies and the parity test.

/**
 * The `@comvi/core/loader` surface a component may drive: the three members
 * that left `useI18n()` plus their sibling `addActiveNamespaces`.
 *
 * Registration-time APIs (`registerLoader`, `getLoader`) are deliberately
 * absent — wiring belongs where the instance is constructed, not in a
 * component.
 */
export interface UseI18nLoaderReturn {
  /** Activate a namespace and load it for the current locale. */
  addActiveNamespace: I18nLoaderApi["addActiveNamespace"];
  /** Activate several namespaces and load them for the current locale. */
  addActiveNamespaces: I18nLoaderApi["addActiveNamespaces"];
  /** Force reload translations from the registered loader. */
  reloadTranslations: I18nLoaderApi["reloadTranslations"];
  /** Subscribe to load failures. Returns an unsubscribe function. */
  onLoadError: I18nLoaderApi["onLoadError"];
}

/**
 * The `@comvi/core/plugins` surface a component may drive.
 *
 * `use` / `registerPostProcessor` / `registerLocaleDetector` are deliberately
 * absent for the same reason as the loader's registration APIs.
 */
export interface UseI18nPluginsReturn {
  /**
   * Register a callback for missing keys. Returns an unsubscribe function.
   *
   * The member is the bound host method — nothing wraps it, so a callback may
   * return the full `TranslationResult` core accepts: a string, or the
   * `Array<string | VirtualNode>` a rich-text fallback needs. Core runs every
   * callback and the first defined result wins. A wrapper-side coercion would
   * narrow that contract to a semantic core does not have.
   */
  onMissingKey: I18nPluginHostApi["onMissingKey"];
}

type AnyHost = WrapperI18nHost;

const loaderBags = new WeakMap<AnyHost, UseI18nLoaderReturn>();
const pluginBags = new WeakMap<AnyHost, UseI18nPluginsReturn>();

function acquireLoader(host: AnyHost): UseI18nLoaderReturn {
  // A cached bag implies the capability was already verified for this host:
  // attach is monotonic, capabilities are added and never removed.
  const cached = loaderBags.get(host);
  if (cached) return cached;

  if (!hasLoaderApi(host)) throw missingCapability("loader");

  const bag: UseI18nLoaderReturn = {
    addActiveNamespace: host.addActiveNamespace.bind(host),
    addActiveNamespaces: host.addActiveNamespaces.bind(host),
    reloadTranslations: host.reloadTranslations.bind(host),
    onLoadError: host.onLoadError.bind(host),
  };
  loaderBags.set(host, bag);
  return bag;
}

function acquirePlugins(host: AnyHost): UseI18nPluginsReturn {
  const cached = pluginBags.get(host);
  if (cached) return cached;

  if (!hasPluginHostApi(host)) throw missingCapability("plugins");

  const bag: UseI18nPluginsReturn = {
    onMissingKey: host.onMissingKey.bind(host),
  };
  pluginBags.set(host, bag);
  return bag;
}
// #endregion capability-parity (B8)

/**
 * Acquire the loader capability of the host in svelte context.
 *
 * Call during component initialisation, like `useI18n()`. Throws
 * `missingCapability("loader")` — in dev and in prod — when the host is a base
 * `@comvi/core` instance, which is every host nobody composed a loader onto.
 * The capability ships in `@comvi/core/loader` and nowhere else, so compose it
 * where the instance is created: `createI18n(...).with(loader())`, or the
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
  return acquireLoader(getI18nContext());
}

/**
 * Acquire the plugin-host capability of the host in svelte context.
 *
 * Call during component initialisation, like `useI18n()`. Throws
 * `missingCapability("plugins")` — in dev and in prod — when the host is the
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
  return acquirePlugins(getI18nContext());
}
