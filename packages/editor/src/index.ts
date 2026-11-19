/**
 * Injects invisible-character key encodings into rendered translations and
 * drives the in-browser visual editor over them.
 */

import type { I18n, I18nPlugin, I18nPluginFactory, PluginI18nInstance } from "@comvi/core";
import { attachDevtools } from "@comvi/core/devtools";
import { attachPlugins, ensureInstallable } from "@comvi/core/plugins";
import {
  EDITOR_MAPPINGS_GLOBAL,
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  toRecordOfNumbers,
  readEditorMappings,
  type InContextEditorMappings,
} from "@comvi/core/editor-bridge";
import { Core } from "./Core";
import {
  addBeforeProcessHook,
  getOrCreatePostProcessorState,
  registerPostProcessorOnce,
} from "./postProcessor";
import { initApiConfig, resetApiConfig } from "./config/api";
import { TranslationKeyEncoder, defaultEncoder } from "./encoding/TranslationKeyEncoder";
import type { TranslationSystemOptions } from "./types";

// Declare process for bundler replacement (webpack/turbopack/vite replace process.env.NODE_ENV at build time)
declare const process: { env?: { NODE_ENV?: string } } | undefined;

export interface EditorOptions extends Omit<TranslationSystemOptions, "targetElement"> {
  /**
   * Optional DOM element to watch for translations
   * Defaults to document.body
   */
  targetElement?: Node;

  /**
   * Override the API key from i18n.apiKey.
   * Used by Chrome extension to inject API key without modifying the i18n instance.
   */
  apiKeyOverride?: string;
}

let runtimeIdCounter = 0;
const activeBrowserEditorRuntimes = new Set<number>();
/** Live browser runtimes per instance: the bridge goes only with the last one. */
const bridgeUsers = new WeakMap<object, number>();

function attachMappingsBridge(target: object, encoder: TranslationKeyEncoder): void {
  if (readEditorMappings(target)) {
    return;
  }
  (target as Record<string, unknown>)[EDITOR_MAPPINGS_GLOBAL] = {
    getKeyMappings: () => encoder.getMappings(),
    loadKeyMappings: (mappings) => encoder.loadMappings(mappings),
  } satisfies InContextEditorMappings;
}

function enqueueNamespaceKeys(
  i18n: PluginI18nInstance,
  pendingCombinedKeys: Set<string>,
  locale: string,
  namespace: string,
): void {
  if (!i18n.hasLocale(locale, namespace)) {
    return;
  }

  const translations = i18n.getMessages(locale, namespace) as Record<string, unknown>;
  for (const key of Object.keys(translations)) {
    pendingCombinedKeys.add(`${namespace}:${key}`);
  }
}

function enqueueLoadedKeys(i18n: PluginI18nInstance, pendingCombinedKeys: Set<string>): void {
  const namespaces = new Set<string>([i18n.getDefaultNamespace(), ...i18n.getActiveNamespaces()]);
  for (const locale of i18n.getLoadedLocales()) {
    for (const namespace of namespaces) {
      enqueueNamespaceKeys(i18n, pendingCombinedKeys, locale, namespace);
    }
  }
}

function flushPendingKeys(pendingCombinedKeys: Set<string>, encoder: TranslationKeyEncoder): void {
  if (pendingCombinedKeys.size === 0) {
    return;
  }

  const sortedCombinedKeys = Array.from(pendingCombinedKeys).sort();
  pendingCombinedKeys.clear();

  for (const combinedKey of sortedCombinedKeys) {
    const separatorIndex = combinedKey.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const namespace = combinedKey.slice(0, separatorIndex);
    const key = combinedKey.slice(separatorIndex + 1);
    encoder.registerKey(key, namespace);
  }
}

/**
 * No-op plugin used when the full entry is evaluated under NODE_ENV=production.
 *
 * Mirrors the real plugin's shape — accepts the i18n instance and returns a
 * cleanup function — so `registerPlugin()` and teardown code behave identically,
 * while the editor runtime never activates.
 */
const noopPlugin: I18nPlugin = () => {
  return () => {
    // no-op cleanup
  };
};

/**
 * The plugin uses `i18n.apiKey` from createI18n options for authentication.
 * If no API key is configured, the editor runs in demo mode.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/vue';
 * import { inContextEditorPlugin } from '@comvi/plugin-in-context-editor';
 *
 * const i18n = createI18n({
 *   locale: 'en',
 *   apiKey: 'your-api-key'
 * });
 * i18n.registerPlugin(inContextEditorPlugin());
 *
 * await i18n.init();
 * ```
 */
export const inContextEditorPlugin: I18nPluginFactory<EditorOptions> = (options): I18nPlugin => {
  // Belt-and-suspenders for bundlers that ignore the "production" export
  // condition (which maps to the lightweight entry-production stub): never
  // activate the editor runtime in production builds.
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    return noopPlugin;
  }
  return (i18n) => {
    const isBrowserRuntime = typeof window !== "undefined" && typeof document !== "undefined";

    // The browser shares one page-wide encoder: the DOM scanner decodes every
    // instance's markers from the same page. A server instance gets its own, so
    // overlapping requests never share or reset each other's key ids.
    const { encoder } = getOrCreatePostProcessorState(
      i18n,
      isBrowserRuntime ? defaultEncoder : new TranslationKeyEncoder(),
    );

    // Expose mapping bridge on i18n for framework adapters (Nuxt/Next) to transfer
    // SSR key mappings to the client before hydration.
    attachMappingsBridge(i18n, encoder);

    const instance = i18n as unknown as Record<string, unknown>;
    const initialMappings = toRecordOfNumbers(instance[EDITOR_INITIAL_MAPPINGS_GLOBAL]);
    delete instance[EDITOR_INITIAL_MAPPINGS_GLOBAL];

    if (initialMappings) {
      // Client hydration path: restore server key-id map before any translation work.
      encoder.loadMappings(initialMappings);
    } else if (
      isBrowserRuntime &&
      activeBrowserEditorRuntimes.size === 0 &&
      Object.keys(encoder.getMappings()).length === 0
    ) {
      // First browser runtime on the page: start from a clean mapping.
      encoder.reset();
    }

    const pendingCombinedKeys = new Set<string>();
    const syncNamespaceKeys = ({ locale, namespace }: { locale: string; namespace: string }) => {
      enqueueNamespaceKeys(i18n, pendingCombinedKeys, locale, namespace);
    };
    enqueueLoadedKeys(i18n, pendingCombinedKeys);
    const unsubscribeNamespaceLoaded = i18n.on("namespaceLoaded", syncNamespaceKeys);

    // When locale changes, re-enqueue all loaded keys so the encoder
    // is ready before the framework re-renders with new translations.
    const unsubscribeLocaleChanged = i18n.on("localeChanged", () => {
      enqueueLoadedKeys(i18n, pendingCombinedKeys);
    });

    const removeBeforeProcessHook = addBeforeProcessHook(i18n, () => {
      flushPendingKeys(pendingCombinedKeys, encoder);
    });

    // Register post-processor in all runtimes so SSR/client markup stays consistent.
    registerPostProcessorOnce(i18n);

    // Browser-only editor runtime: no-op during SSR/server execution. The
    // bridge ref-count below tracks browser runtimes only: a server instance is
    // discarded with its request, bridge and encoder included.
    if (!isBrowserRuntime) {
      return () => {
        removeBeforeProcessHook();
        unsubscribeNamespaceLoaded();
        unsubscribeLocaleChanged();
      };
    }

    // Context collection is ON by default. The site's `createI18n` option is
    // the single developer-level opt-out and always wins: `collectContext:
    // false` on the instance cannot be re-enabled by the plugin option. Otherwise
    // the plugin option decides, and leaving it unset keeps Core's default.
    const collectContext = i18n.collectContext === false ? false : options?.collectContext;

    const core = new Core(
      {
        targetElement: options?.targetElement || document.body,
        tagAttributes: options?.tagAttributes,
        debug: options?.debug,
        highlightStyle: options?.highlightStyle,
        collectContext,
        screenGroupResolver: options?.screenGroupResolver,
      },
      i18n,
    );
    const instanceId = core.getInstanceId();

    // Initialize API configuration (demo mode if no apiKey provided)
    // Use apiKeyOverride if provided (for Chrome extension), otherwise use i18n.apiKey
    const apiKey = options?.apiKeyOverride ?? i18n.apiKey;
    try {
      initApiConfig(apiKey, instanceId);
    } catch (error) {
      core.stop();
      throw error;
    }

    // NOTE: the editor deliberately does NOT accept an API key via DOM
    // events. Any page script can dispatch or listen to those, so a key on
    // that channel is readable by third-party code. The Chrome extension
    // activates the standalone runtime with a proxy transport instead —
    // credentials stay in the extension's service worker.

    core.start();
    const runtimeId = ++runtimeIdCounter;
    activeBrowserEditorRuntimes.add(runtimeId);
    bridgeUsers.set(i18n, (bridgeUsers.get(i18n) ?? 0) + 1);

    return () => {
      removeBeforeProcessHook();
      unsubscribeNamespaceLoaded();
      unsubscribeLocaleChanged();
      core.stop();
      resetApiConfig(instanceId);
      activeBrowserEditorRuntimes.delete(runtimeId);
      const users = (bridgeUsers.get(i18n) ?? 0) - 1;
      if (users > 0) {
        bridgeUsers.set(i18n, users);
      } else {
        bridgeUsers.delete(i18n);
        delete (i18n as unknown as Record<string, unknown>)[EDITOR_MAPPINGS_GLOBAL];
      }
    };
  };
};

/** The instance surface `inContextEditor` guarantees on the way out. */
export type InContextEditorInstaller = <T extends I18n<any>>(i18n: T) => T;

/**
 * The in-context editor as a `.use(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en", apiKey }).use(inContextEditor());
 * await i18n.init();
 * ```
 *
 * Devtools is ensured BEFORE plugins on purpose: the editor's whole point is
 * being driven from outside the page, so an editor-enabled instance announces
 * itself on the `window.__COMVI__` queue without a second `.use(devtools())`.
 * Both attaches are idempotent — an already-composed instance keeps its
 * `instanceId`, its queue entry and every registered plugin.
 *
 * `required`, `timeout`, `onError`, cleanup registration and LIFO destroy are
 * not re-implemented here; they keep running inside `PluginI18nInstance`, because
 * the last thing this installer does is call `registerPlugin`.
 *
 * The instance type comes back UNCHANGED, deliberately: the package's `production`
 * condition ships this same signature with `(instance) => instance`, attaching nothing.
 * Promising `I18nPluginApi` here would type a member present in dev and
 * absent in production. Need `registerPlugin` yourself? Compose `.use(plugins())`.
 *
 * `registerPlugin(inContextEditor(…))` is a type error. Under this entry it fails at
 * `init()` on `ensureInstallable`; under the `production` condition the
 * identity no-op hands the instance back and the plugin capability's return-shape guard
 * rejects it — a plugin may only return nothing or a cleanup function.
 */
export function inContextEditor(options?: EditorOptions): InContextEditorInstaller {
  return (i18n) => {
    const instance = attachPlugins(attachDevtools(ensureInstallable(i18n, "inContextEditor")));
    instance.registerPlugin(inContextEditorPlugin(options));
    return i18n;
  };
}

export type { TranslationSystemOptions, HighlightStyleOptions } from "./types";
export type { ElementData, NodeData, KeyInfo } from "./types/translation";

// Kept for backward compatibility.
export { init, stop } from "./main";

export { TranslationRegistry } from "./TranslationRegistry";
export { TranslationScanner } from "./TranslationScanner";
export { TranslationKeyEncoder, defaultEncoder } from "./encoding/TranslationKeyEncoder";

export {
  encodeKeyToInvisible,
  decodeInvisibleToKey,
  scanForInvisibleKeys,
  containsInvisibleCharacters,
  registerKey,
  getKeyFromId,
  loadKeyMappings,
  getKeyMappings,
  extractAllIds,
  resetEncoder,
  INVISIBLE_CHARS,
} from "./translation";

export { debounce } from "./utils/debounce";
export {
  collectElementAttributes,
  collectAllDescendantNodes,
  createTreeWalker,
  isNodeContainedIn,
  isAttributeAffectedByNodes,
} from "./utils/domHelpers";
