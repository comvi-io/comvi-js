// Capability-segregated composables (framework-slim plan §3.2, D′).
//
// `useI18n()` is type-honest by ABSENCE: the loader/plugin-host members are
// not on its return, in types or at runtime, in any build. They live here
// instead, behind one acquisition call per capability that verifies the
// injected instance's `core` STRUCTURALLY and throws a loud, hint-carrying
// error when the capability was never attached — in dev AND in prod (§2.4).
// There is no silent no-op and no dev-only tombstone.
//
// Identity contract (§3.2): a module-level `WeakMap<host, bag>` per
// capability. The bag and every member are referentially stable per host
// instance across components and re-renders, so two components under one app
// receive the same function references.
import { inject } from "vue";
import { hasLoaderApi, hasPluginHostApi, missingCapability } from "@comvi/core/slim";
import type { I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "@comvi/core";
import { I18N_INJECTION_KEY } from "../keys";

/**
 * The `@comvi/core/loader` surface a component may drive: the three members
 * that left `useI18n()` plus their sibling `addActiveNamespaces`.
 *
 * Registration-time APIs (`registerLoader`, `getLoader`) are deliberately
 * absent — wiring belongs where the instance is constructed (`i18n.core.*` in
 * app setup), not in a component.
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
  /** Register a callback for missing keys. Returns an unsubscribe function. */
  onMissingKey: I18nPluginHostApi["onMissingKey"];
}

type AnyHost = WrapperI18nHost;

const loaderBags = new WeakMap<AnyHost, UseI18nLoaderReturn>();
const pluginBags = new WeakMap<AnyHost, UseI18nPluginsReturn>();

function injectHost(composable: string): AnyHost {
  const injected = inject(I18N_INJECTION_KEY);

  if (!injected) {
    throw new Error(
      `[i18n] ${composable} must be used within a Vue app with i18n plugin installed. ` +
        "Make sure you called app.use(i18n) before using this composable.",
    );
  }

  return injected.core;
}

/**
 * Acquire the loader capability of the installed i18n instance's core.
 *
 * Throws `missingCapability("loader")` — in dev and in prod — when the core is
 * a bare `@comvi/core/slim` instance. Compose the capability in where the
 * instance is created (`attachLoader(createI18n(...))`) or use the root
 * `@comvi/core` entry.
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
  const host = injectHost("useI18nLoader");

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

/**
 * Acquire the plugin-host capability of the installed i18n instance's core.
 *
 * Throws `missingCapability("plugins")` — in dev and in prod — when the core
 * is a bare `@comvi/core/slim` instance.
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
  const host = injectHost("useI18nPlugins");

  const cached = pluginBags.get(host);
  if (cached) return cached;

  if (!hasPluginHostApi(host)) throw missingCapability("plugins");

  const bag: UseI18nPluginsReturn = {
    onMissingKey: host.onMissingKey.bind(host),
  };
  pluginBags.set(host, bag);
  return bag;
}
