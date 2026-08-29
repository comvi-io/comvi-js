// Capability-segregated hooks (landed in the framework-slim plan §3.2, D′).
//
// `useI18n()` is type-honest by ABSENCE: the loader/plugin-host members are
// not on its return, in types or at runtime, in any build. They live here
// instead, behind one acquisition call per capability that verifies the host
// STRUCTURALLY and throws a loud, hint-carrying error when the capability was
// never attached — in dev AND in prod (§2.4). There is no silent no-op and no
// dev-only tombstone.
//
// Identity contract (§3.2): a module-level `WeakMap<host, bag>` per
// capability. The bag and every member are referentially stable per host
// instance across components and re-renders — deliberately NOT a react-local
// `useMemo`, so two components under one provider receive the same function
// references.
import { hasLoaderApi, hasPluginHostApi, missingCapability } from "@comvi/core";
import type { I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "@comvi/core";
import { useI18nInstance } from "./I18nProvider";

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
   * Identical to the member that used to live on `useI18n()`, including its
   * react-side coercion of non-string callback results.
   */
  onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => string | void,
  ) => () => void;
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

  const pluginHost: I18nPluginHostApi = host;
  const bag: UseI18nPluginsReturn = {
    onMissingKey: (callback) =>
      pluginHost.onMissingKey((key, loc, ns) => {
        const result = callback(key, loc, ns);
        return typeof result === "string" || result === undefined ? result : String(result);
      }),
  };
  pluginBags.set(host, bag);
  return bag;
}

/**
 * Acquire the loader capability of the host provided by `<I18nProvider>`.
 *
 * Throws `missingCapability("loader")` — in dev and in prod — when the host is
 * a base `@comvi/core` instance, which is every host nobody composed a loader
 * onto. The capability ships in `@comvi/core/loader` and nowhere else, so
 * compose it where the instance is created: `createI18n(...).with(loader())`,
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
  const { i18n } = useI18nInstance();
  return acquireLoader(i18n);
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
  const { i18n } = useI18nInstance();
  return acquirePlugins(i18n);
}
