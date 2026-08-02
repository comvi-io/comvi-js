/**
 * In-Context Editor Plugin for Comvi i18n
 *
 * This plugin integrates the in-context translation editor with @comvi/vue.
 * It automatically injects invisible character encodings into translations and provides
 * a visual editor for managing translations directly in the browser.
 */

import type { I18nPlugin, I18nPluginFactory, I18nPluginHost } from "@comvi/core";
import {
  EDITOR_MAPPINGS_GLOBAL,
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  toRecordOfNumbers,
  readEditorMappings,
  type InContextEditorMappings,
} from "@comvi/core/editor-bridge";
import { Core } from "./Core";
import { addBeforeProcessHook, registerPostProcessorOnce } from "./postProcessor";
import { initApiConfig, resetApiConfig } from "./config/api";
import { getKeyMappings, loadKeyMappings, registerKey, resetEncoder } from "./translation";
import type { TranslationSystemOptions } from "./types";

// Declare process for bundler replacement (webpack/turbopack/vite replace process.env.NODE_ENV at build time)
declare const process: { env?: { NODE_ENV?: string } } | undefined;

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

let runtimeIdCounter = 0;
const activeBrowserEditorRuntimes = new Set<number>();

function attachMappingsBridge(target: unknown): void {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    return;
  }
  if (readEditorMappings(target)) {
    return;
  }
  (target as Record<string, unknown>)[EDITOR_MAPPINGS_GLOBAL] = {
    getKeyMappings,
    loadKeyMappings,
  } satisfies InContextEditorMappings;
}

function enqueueNamespaceKeys(
  i18n: I18nPluginHost,
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

function enqueueLoadedKeys(i18n: I18nPluginHost, pendingCombinedKeys: Set<string>): void {
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
 * No-op plugin used when the full entry is evaluated under NODE_ENV=production.
 *
 * Mirrors the real plugin's shape — accepts the i18n instance and returns a
 * cleanup function — so `i18n.use()` and teardown code behave identically,
 * while the editor runtime never activates.
 */
const noopPlugin: I18nPlugin = () => {
  return () => {
    // no-op cleanup
  };
};

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
  // Belt-and-suspenders for bundlers that ignore the "production" export
  // condition (which maps to the lightweight entry-production stub): never
  // activate the editor runtime in production builds.
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    return noopPlugin;
  }
  return (i18n) => {
    const isBrowserRuntime = typeof window !== "undefined" && typeof document !== "undefined";

    // Expose mapping bridge on i18n for framework adapters (Nuxt/Next) to transfer
    // SSR key mappings to the client before hydration.
    attachMappingsBridge(i18n);

    const host = i18n as unknown as Record<string, unknown>;
    const initialMappings = toRecordOfNumbers(host[EDITOR_INITIAL_MAPPINGS_GLOBAL]);
    delete host[EDITOR_INITIAL_MAPPINGS_GLOBAL];

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
        collectContext: options?.collectContext,
        screenGroupResolver: options?.screenGroupResolver,
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

    // NOTE: the editor deliberately does NOT accept an API key via DOM
    // events. Any page script can dispatch or listen to those, so a key on
    // that channel is readable by third-party code. The Chrome extension
    // activates the standalone runtime with a proxy transport instead —
    // credentials stay in the extension's service worker.

    // Start the editor
    core.start();
    const runtimeId = ++runtimeIdCounter;
    activeBrowserEditorRuntimes.add(runtimeId);

    return () => {
      removeBeforeProcessHook();
      unsubscribeNamespaceLoaded();
      unsubscribeLocaleChanged();
      core.stop();
      resetApiConfig(instanceId);
      activeBrowserEditorRuntimes.delete(runtimeId);
      // Clean up mappings bridge from i18n instance
      const host = i18n as unknown as Record<string, unknown>;
      if (host[EDITOR_MAPPINGS_GLOBAL]) {
        delete host[EDITOR_MAPPINGS_GLOBAL];
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
