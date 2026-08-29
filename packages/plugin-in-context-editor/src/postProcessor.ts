/**
 * Injects the invisible-character key encoding into translation results — how
 * the DOM watcher later tells which key produced which element.
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

export function registerPostProcessorOnce(i18n: I18nWithPostProcessor): void {
  const state = getOrCreatePostProcessorState(i18n);
  if (state.registered) {
    return;
  }
  i18n.registerPostProcessor(state.processor);
  state.registered = true;
}

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

export function createInvisibleCharPostProcessor(options: InvisibleCharPostProcessorOptions = {}) {
  return (
    result: TranslationResult,
    key: string,
    ns: string,
    params: TranslationParams,
  ): TranslationResult => {
    options.beforeProcess?.();

    if (params?.raw === true) {
      return result;
    }

    const id = registerKey(key, ns);
    const encodedKey = encodeKeyToInvisible(id);

    if (typeof result === "string") {
      return `${result}${encodedKey}`;
    }

    if (Array.isArray(result)) {
      const lastIndex = result.length - 1;
      const lastElement = result[lastIndex];

      if (typeof lastElement === "string") {
        const modified = [...result];
        modified[lastIndex] = `${lastElement}${encodedKey}`;
        return modified;
      } else {
        return [...result, encodedKey];
      }
    }

    return result;
  };
}
