// Capability-segregated acquisition (landed in the framework-slim plan §3.2, D′).
//
// `useI18n()` is type-honest by ABSENCE: the loader/plugin-host members are
// not on its return, in types or at runtime, in any build. They live here
// instead, behind one acquisition call per capability that verifies the host
// STRUCTURALLY and throws a loud, hint-carrying error when the capability was
// never attached — in dev AND in prod (§2.4). There is no silent no-op and no
// dev-only tombstone.
//
// Svelte idiom (§3.2): these are CONTEXT READERS, not stores. They call
// `getI18nContext()`, so — exactly like `useI18n()` and `getI18nContext()`
// itself — they are callable during component initialisation only. What they
// return is a plain object of bound functions captured at that moment;
// nothing here is reactive, and `$`-prefixing a member is a type error. The
// asymmetry with `createLocaleStore()` & friends is deliberate: a capability
// action is an imperative operation, not a value that changes over time.
//
// Naming: `useI18nLoader` / `useI18nPlugins` rather than a svelte-flavoured
// `getI18nLoader` — the package already ships `useI18n()`, so the `use*` idiom
// is established in-package, and one grep finds the same API across all four
// wrappers (plan §3.2, decided).
//
// Identity contract (§3.2): a module-level `WeakMap<host, bag>` per
// capability. The bag and every member are referentially stable per host
// instance across components and re-initialisations.
import { hasLoaderApi, hasPluginHostApi, missingCapability } from "@comvi/core";
import type { I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "@comvi/core";
import { getI18nContext } from "./context.js";

// #region capability-parity (B8) — FRAMEWORK-NEUTRAL, BYTE-IDENTICAL
// Everything between the region markers is the same text in @comvi/react,
// @comvi/vue, @comvi/solid and @comvi/svelte, character for character.
// `scripts/wrapper-hooks-parity.test.mjs` (root `pnpm test:release-tools`)
// fails if it drifts, because the four copies drifted before: react used to
// wrap the `onMissingKey` callback in a `String(result)` coercion the other
// three did not have — an invented semantic (see `UseI18nPluginsReturn`).
// Only the host acquisition below the region may differ per framework.
//
// PHASE 3 FOLLOW-UP: this region belongs in `@comvi/core`, which every wrapper
// already imports, as the exact pair
//   export function acquireLoaderApi(host: WrapperI18nHost): UseI18nLoaderReturn;
//   export function acquirePluginsApi(host: WrapperI18nHost): UseI18nPluginsReturn;
// (with `UseI18nLoaderReturn` / `UseI18nPluginsReturn` re-exported from core and
// the WeakMaps living beside them, so bag identity stays per-host and per-core-
// module). Each wrapper then shrinks to a context read plus one call, and this
// parity test retires with it.

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
   * The type is core's `I18nPluginHostApi["onMissingKey"]` verbatim, and the
   * member is the bound host method — nothing wraps it. A callback may
   * therefore return the full `TranslationResult` core accepts, i.e. a string
   * OR the `Array<string | VirtualNode>` a rich-text fallback needs, and core
   * decides what to do with it (`_missHook`: every callback runs, the first
   * defined result wins). A wrapper-side coercion would narrow that contract
   * to a semantic core does not have.
   */
  onMissingKey: I18nPluginHostApi["onMissingKey"];
}

type AnyHost = WrapperI18nHost;

const loaderBags = new WeakMap<AnyHost, UseI18nLoaderReturn>();
const pluginBags = new WeakMap<AnyHost, UseI18nPluginsReturn>();

function acquireLoader(host: AnyHost): UseI18nLoaderReturn {
  // A cached bag implies the capability was already verified for this host:
  // attach is monotonic, capabilities are added and never removed (§3.2).
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
