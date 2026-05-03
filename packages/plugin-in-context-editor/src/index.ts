/**
 * In-Context Editor Plugin for Comvi i18n
 *
 * This plugin integrates the in-context translation editor with @comvi/vue.
 * It automatically injects invisible character encodings into translations and provides
 * a visual editor for managing translations directly in the browser.
 */

import type { I18nPlugin, I18nPluginFactory, I18n } from "@comvi/core";
import { Core } from "./Core";
import { addBeforeProcessHook, registerPostProcessorOnce } from "./postProcessor";
import { initApiConfig, resetApiConfig } from "./config/api";
import { getKeyMappings, loadKeyMappings, registerKey, resetEncoder } from "./translation";
import type { TranslationSystemOptions } from "./types";

/**
 * Configuration options for the In-Context Editor Plugin
 */
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

type InContextEditorMappingsBridge = {
  getKeyMappings: () => Record<string, number>;
  loadKeyMappings: (mappings: Record<string, number>) => void;
};

const MAPPINGS_BRIDGE_KEY = "__comviInContextEditorMappings";
const INITIAL_MAPPINGS_KEY = "__comviInContextEditorInitialMappings";
const EXTERNAL_CONFIG_EVENT = "comvi-in-context-editor:configure";
let runtimeIdCounter = 0;
const activeBrowserEditorRuntimes = new Set<number>();

function attachMappingsBridge(target: unknown): void {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    return;
  }
  const host = target as Record<string, unknown>;
  const existing = host[MAPPINGS_BRIDGE_KEY];
  if (
    existing &&
    typeof existing === "object" &&
    typeof (existing as { getKeyMappings?: unknown }).getKeyMappings === "function" &&
    typeof (existing as { loadKeyMappings?: unknown }).loadKeyMappings === "function"
  ) {
    return;
  }

  host[MAPPINGS_BRIDGE_KEY] = {
    getKeyMappings,
    loadKeyMappings,
  } satisfies InContextEditorMappingsBridge;
}

function toRecordOfNumbers(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, number> = {};
  for (const [key, item] of entries) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return undefined;
    }
    result[key] = item;
  }
  return result;
}

function enqueueNamespaceKeys(
  i18n: I18n,
  pendingCombinedKeys: Set<string>,
  locale: string,
  namespace: string,
): void {
  if (!i18n.hasLocale(locale, namespace)) {
    return;
  }

  const translations = i18n.getTranslations(locale, namespace) as Record<string, unknown>;
  for (const key of Object.keys(translations)) {
    pendingCombinedKeys.add(`${namespace}:${key}`);
  }
}

function enqueueLoadedKeys(i18n: I18n, pendingCombinedKeys: Set<string>): void {
  const namespaces = new Set<string>([i18n.getDefaultNamespace(), ...i18n.getActiveNamespaces()]);
  for (const locale of i18n.getLoadedLocales()) {
    for (const namespace of namespaces) {
      enqueueNamespaceKeys(i18n, pendingCombinedKeys, locale, namespace);
    }
  }
}

function flushPendingKeys(pendingCombinedKeys: Set<string>): void {
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
    registerKey(key, namespace);
  }
}

/**
 * In-Context Editor Plugin Factory
 *
 * Creates a plugin that integrates with the Comvi i18n to provide
 * in-context translation editing capabilities.
 *
 * The plugin uses `i18n.apiKey` from createI18n options for authentication.
 * If no API key is configured, the editor runs in demo mode.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/vue';
 * import { InContextEditorPlugin } from '@comvi/plugin-in-context-editor';
 *
 * const i18n = createI18n({
 *   locale: 'en',
 *   apiKey: 'your-api-key'
 * });
 * i18n.use(InContextEditorPlugin());
 *
 * await i18n.init();
 * ```
 */
export const InContextEditorPlugin: I18nPluginFactory<EditorOptions> = (options): I18nPlugin => {
  return (i18n) => {
    const isBrowserRuntime = typeof window !== "undefined" && typeof document !== "undefined";

    // Expose mapping bridge on i18n for framework adapters (Nuxt/Next) to transfer
    // SSR key mappings to the client before hydration.
    attachMappingsBridge(i18n);

    const host = i18n as unknown as Record<string, unknown>;
    const initialMappings = toRecordOfNumbers(host[INITIAL_MAPPINGS_KEY]);
    delete host[INITIAL_MAPPINGS_KEY];

    if (initialMappings) {
      // Client hydration path: restore server key-id map before any translation work.
      loadKeyMappings(initialMappings);
    } else if (!isBrowserRuntime) {
      // Keep encoder state request-scoped on server/SSR runtimes.
      resetEncoder();
    } else if (
      activeBrowserEditorRuntimes.size === 0 &&
      Object.keys(getKeyMappings()).length === 0
    ) {
      // First browser runtime on the page: start from a clean mapping.
      resetEncoder();
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
      flushPendingKeys(pendingCombinedKeys);
    });

    // Register post-processor in all runtimes so SSR/client markup stays consistent.
    registerPostProcessorOnce(i18n);

    // Browser-only editor runtime: no-op during SSR/server execution.
    if (!isBrowserRuntime) {
      return () => {
        removeBeforeProcessHook();
        unsubscribeNamespaceLoaded();
        unsubscribeLocaleChanged();
      };
    }

    // Initialize the editor core with i18n instance
    const core = new Core(
      {
        targetElement: options?.targetElement || document.body,
        tagAttributes: options?.tagAttributes,
        debug: options?.debug,
        highlightStyle: options?.highlightStyle,
      },
      i18n, // Pass i18n instance to Core
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

    // Standalone IIFE / Chrome extension can dispatch this event to inject
    // an API key without rebuilding the host app's bundle. The base URL is
    // baked at library build time and is not negotiable here.
    const handleExternalConfig = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail =
        typeof customEvent.detail === "string"
          ? JSON.parse(customEvent.detail)
          : customEvent.detail || {};
      const externalApiKey = typeof detail.apiKey === "string" ? detail.apiKey.trim() : undefined;

      initApiConfig(externalApiKey, instanceId);
    };

    window.addEventListener(EXTERNAL_CONFIG_EVENT, handleExternalConfig);

    // Start the editor
    core.start();
    const runtimeId = ++runtimeIdCounter;
    activeBrowserEditorRuntimes.add(runtimeId);

    return () => {
      removeBeforeProcessHook();
      unsubscribeNamespaceLoaded();
      unsubscribeLocaleChanged();
      window.removeEventListener(EXTERNAL_CONFIG_EVENT, handleExternalConfig);
      core.stop();
      resetApiConfig(instanceId);
      activeBrowserEditorRuntimes.delete(runtimeId);
      // Clean up mappings bridge from i18n instance
      const host = i18n as unknown as Record<string, unknown>;
      if (host[MAPPINGS_BRIDGE_KEY]) {
        delete host[MAPPINGS_BRIDGE_KEY];
      }
    };
  };
};

// Export types
export type { TranslationSystemOptions, HighlightStyleOptions } from "./types";
export type { ElementData, NodeData, KeyInfo } from "./types/translation";

// Re-export main initialization functions for backward compatibility
export { init, stop } from "./main";

// Export refactored classes
export { TranslationRegistry } from "./TranslationRegistry";
export { TranslationScanner } from "./TranslationScanner";
export { TranslationKeyEncoder, defaultEncoder } from "./encoding/TranslationKeyEncoder";

// Export encoding utilities
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

// Export utility functions
export { debounce } from "./utils/debounce";
export {
  collectElementAttributes,
  collectAllDescendantNodes,
  createTreeWalker,
  isNodeContainedIn,
  isAttributeAffectedByNodes,
} from "./utils/domHelpers";
