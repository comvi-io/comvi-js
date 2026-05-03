import type { I18nPlugin, I18nPluginFactory } from "@comvi/core";
import type { TranslationSystemOptions } from "./types";

export interface EditorOptions extends Omit<TranslationSystemOptions, "targetElement"> {
  targetElement?: Node;
  apiKeyOverride?: string;
}

/**
 * Production entrypoint: keep API compatible while making the editor a no-op.
 * This keeps the heavy editor runtime out of production bundles.
 */
export const InContextEditorPlugin: I18nPluginFactory<EditorOptions> = (): I18nPlugin => {
  return () => undefined;
};
