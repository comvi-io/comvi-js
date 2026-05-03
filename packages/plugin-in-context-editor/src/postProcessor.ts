/**
 * Post-processor for injecting invisible character encoding into translations
 * This allows the DOM watcher to detect which translation keys are present in elements
 */

import type { TranslationParams, TranslationResult } from "@comvi/core";
import { registerKey, encodeKeyToInvisible } from "./translation";

export interface InvisibleCharPostProcessorOptions {
  /**
   * Optional hook executed before processing each translation result.
   * Used by framework adapters/plugins to prepare deterministic key mappings.
   */
  beforeProcess?: () => void;
}

type BeforeProcessHook = () => void;

interface InContextPostProcessorState {
  registered: boolean;
  hooks: Set<BeforeProcessHook>;
  processor: (
    result: TranslationResult,
    key: string,
    ns: string,
    params: TranslationParams,
  ) => TranslationResult;
}

const POST_PROCESSOR_STATE_KEY = "__comviInContextEditorPostProcessorState";

type I18nWithPostProcessor = {
  registerPostProcessor: (
    fn: (
      result: TranslationResult,
      key: string,
      ns: string,
      params: TranslationParams,
    ) => TranslationResult,
  ) => void;
};

/**
 * Returns a stable post-processor state object attached to the i18n instance.
 * Ensures the invisible-marker processor is registered at most once per i18n instance.
 */
export function getOrCreatePostProcessorState(
  i18n: I18nWithPostProcessor,
): InContextPostProcessorState {
  const host = i18n as Record<string, unknown>;
  const existing = host[POST_PROCESSOR_STATE_KEY] as InContextPostProcessorState | undefined;

  if (existing) {
    return existing;
  }

  const hooks = new Set<BeforeProcessHook>();
  const processor = createInvisibleCharPostProcessor({
    beforeProcess: () => {
      hooks.forEach((hook) => hook());
    },
  });

  const state: InContextPostProcessorState = {
    registered: false,
    hooks,
    processor,
  };

  host[POST_PROCESSOR_STATE_KEY] = state;
  return state;
}

/**
 * Registers the in-context post-processor once for the given i18n instance.
 */
export function registerPostProcessorOnce(i18n: I18nWithPostProcessor): void {
  const state = getOrCreatePostProcessorState(i18n);
  if (state.registered) {
    return;
  }
  i18n.registerPostProcessor(state.processor);
  state.registered = true;
}

/**
 * Adds a before-process hook to the shared post-processor state.
 * Returns a cleanup function that removes the hook.
 */
export function addBeforeProcessHook(
  i18n: I18nWithPostProcessor,
  hook: BeforeProcessHook,
): () => void {
  const state = getOrCreatePostProcessorState(i18n);
  state.hooks.add(hook);
  return () => {
    state.hooks.delete(hook);
  };
}

/**
 * Creates a post-processor that injects invisible character encodings
 * @returns Post-processor function compatible with PostProcessFn
 */
export function createInvisibleCharPostProcessor(options: InvisibleCharPostProcessorOptions = {}) {
  return (
    result: TranslationResult,
    key: string,
    ns: string,
    params: TranslationParams,
  ): TranslationResult => {
    options.beforeProcess?.();

    // Skip marker injection if raw flag is set
    if (params?.raw === true) {
      return result;
    }

    // Register the key with namespace and get its encoded invisible characters
    const id = registerKey(key, ns);
    const encodedKey = encodeKeyToInvisible(id);

    // Handle string results
    if (typeof result === "string") {
      return `${result}${encodedKey}`;
    }

    // Handle array results (with VNodes)
    if (Array.isArray(result)) {
      // Append invisible characters to the last string element
      // or add as a new string element if no strings exist
      const lastIndex = result.length - 1;
      const lastElement = result[lastIndex];

      if (typeof lastElement === "string") {
        // Modify the last string element
        const modified = [...result];
        modified[lastIndex] = `${lastElement}${encodedKey}`;
        return modified;
      } else {
        // Append as new string element
        return [...result, encodedKey];
      }
    }

    // Fallback: return unchanged
    return result;
  };
}
