/**
 * Standalone entry point for CDN loading
 *
 * This file is built as an IIFE that exposes ComviInContextEditor on window.
 * Used by Chrome extension to dynamically load the plugin into pages.
 */

import { InContextEditorPlugin, type EditorOptions } from "./index";
import { Core } from "./Core";
import { getApiConfig, initApiConfig, resetApiConfig } from "./config/api";
import { registerPostProcessorOnce } from "./postProcessor";
import { fetchApiTranslations } from "@comvi/plugin-fetch-loader";
import type { I18n, TranslationValue } from "@comvi/core";

/** Active Core instance for cleanup */
let activeCore: Core | null = null;
const EXTERNAL_CONFIG_EVENT = "comvi-in-context-editor:configure";

export interface ActivateOptions extends EditorOptions {
  /** API key for authentication (required for standalone mode) */
  apiKey?: string;
  /** Comvi instance ID to use (optional, uses first instance if not specified) */
  instanceId?: string;
  /**
   * Fetch fresh translations from the Comvi API before enabling click-to-edit.
   * Enabled by default for standalone/extension activation.
   */
  refreshTranslations?: boolean;
}

export interface ActivateResult {
  /** Stop the editor and clean up */
  stop: () => void;
  /** The Core instance ID */
  instanceId: string;
}

async function refreshTranslationsFromApi(
  i18n: I18n,
  apiKey: string | undefined,
  scopeId: string,
): Promise<void> {
  if (!apiKey) {
    return;
  }

  const apiBaseUrl = getApiConfig(scopeId).baseUrl;

  const locales = i18n.getLoadedLocales();
  const namespaces = Array.from(
    new Set([i18n.getDefaultNamespace(), ...i18n.getActiveNamespaces()]),
  );

  if (locales.length === 0 || namespaces.length === 0) {
    return;
  }

  try {
    const updates: Record<string, Record<string, TranslationValue>> = {};
    await Promise.all(
      locales.map(async (locale) => {
        const store = await fetchApiTranslations(apiKey, locale, namespaces, apiBaseUrl);
        for (const [key, translations] of store) {
          updates[key] = translations as Record<string, TranslationValue>;
        }
      }),
    );

    if (Object.keys(updates).length > 0) {
      i18n.addTranslations(updates);
    }
  } catch (error) {
    console.warn("[ComviInContextEditor] Failed to refresh translations from API.", error);
  }
}

function refreshRenderedTranslations(i18n: I18n): void {
  // Re-add loaded translations after registering the post-processor so
  // framework bindings bump their cache revision and re-render marked text.
  const namespaces = new Set([i18n.getDefaultNamespace(), ...i18n.getActiveNamespaces()]);
  const updates: Record<string, Record<string, TranslationValue>> = {};

  for (const locale of i18n.getLoadedLocales()) {
    for (const namespace of namespaces) {
      if (!i18n.hasLocale(locale, namespace)) {
        continue;
      }

      const translations = i18n.getTranslations(locale, namespace) as Record<
        string,
        TranslationValue
      >;
      if (Object.keys(translations).length > 0) {
        updates[`${locale}:${namespace}`] = translations;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    i18n.addTranslations(updates);
  }
}

/**
 * Activate the in-context editor on the current page
 *
 * @param options - Editor options including apiKey
 * @returns Activation result with stop function, or null if failed
 *
 * @example
 * ```js
 * const editor = window.ComviInContextEditor.activate({
 *   apiKey: 'your-api-key',
 * });
 *
 * // Later, to deactivate:
 * editor.stop();
 * ```
 */
export function activate(options: ActivateOptions): ActivateResult | null {
  // Check if already active
  if (activeCore) {
    console.warn("[ComviInContextEditor] Already active. Call deactivate() first.");
    return null;
  }

  // Find Comvi global
  const comviGlobal = (window as any).__COMVI__;
  if (!comviGlobal) {
    console.error(
      "[ComviInContextEditor] No Comvi i18n found. Ensure @comvi/core is loaded on the page.",
    );
    return null;
  }

  // Get i18n instance
  const i18n = comviGlobal.get(options.instanceId) as I18n | undefined;
  if (!i18n) {
    console.error(
      "[ComviInContextEditor] No i18n instance found.",
      options.instanceId ? `Instance ID: ${options.instanceId}` : "No instances registered.",
    );
    return null;
  }

  // Register post-processor for invisible characters (idempotent per i18n instance)
  registerPostProcessorOnce(i18n);

  // Create and start Core
  activeCore = new Core(
    {
      targetElement: options.targetElement || document.body,
      tagAttributes: options.tagAttributes,
      debug: options.debug,
    },
    i18n,
  );
  const instanceId = activeCore.getInstanceId();

  // Initialize API configuration
  const apiKey = (options.apiKey ?? options.apiKeyOverride ?? i18n.apiKey)?.trim();
  try {
    initApiConfig(apiKey, instanceId);
    window.dispatchEvent(
      new CustomEvent(EXTERNAL_CONFIG_EVENT, {
        detail: JSON.stringify({ apiKey }),
      }),
    );
  } catch (error) {
    activeCore.stop();
    activeCore = null;
    throw error;
  }

  activeCore.start();
  console.info(`[ComviInContextEditor] Activated (instance: ${instanceId})`);

  if (options.refreshTranslations !== false) {
    void refreshTranslationsFromApi(i18n, apiKey, instanceId).finally(() => {
      if (activeCore === null || activeCore.getInstanceId() !== instanceId) {
        return;
      }
      refreshRenderedTranslations(i18n);
    });
  }

  return {
    stop: deactivate,
    instanceId,
  };
}

/**
 * Deactivate the in-context editor and clean up resources
 */
export function deactivate(): void {
  if (!activeCore) {
    console.warn("[ComviInContextEditor] Not active.");
    return;
  }

  const instanceId = activeCore.getInstanceId();
  activeCore.stop();
  resetApiConfig(instanceId);
  activeCore = null;

  console.info("[ComviInContextEditor] Deactivated");
}

/**
 * Check if the editor is currently active
 */
export function isActive(): boolean {
  return activeCore !== null;
}

/**
 * Get information about the current state
 */
export function getStatus(): {
  active: boolean;
  instanceId: string | null;
  comviDetected: boolean;
  comviVersion: string | null;
  instanceCount: number;
} {
  const comviGlobal = (window as any).__COMVI__;

  return {
    active: activeCore !== null,
    instanceId: activeCore?.getInstanceId() ?? null,
    comviDetected: !!comviGlobal,
    comviVersion: comviGlobal?.version ?? null,
    instanceCount: comviGlobal?.instances?.size ?? 0,
  };
}

// Also export the plugin factory for advanced usage
export { InContextEditorPlugin };

// Expose on window for CDN usage
declare global {
  interface Window {
    ComviInContextEditor?: {
      activate: typeof activate;
      deactivate: typeof deactivate;
      isActive: typeof isActive;
      getStatus: typeof getStatus;
      InContextEditorPlugin: typeof InContextEditorPlugin;
    };
  }
}

// Auto-expose when loaded
if (typeof window !== "undefined") {
  window.ComviInContextEditor = {
    activate,
    deactivate,
    isActive,
    getStatus,
    InContextEditorPlugin,
  };
}
