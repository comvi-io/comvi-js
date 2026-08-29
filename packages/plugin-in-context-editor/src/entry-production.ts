import type { I18n, I18nPlugin, I18nPluginFactory } from "@comvi/core";
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

/** The host surface `inContextEditor` guarantees on the way out. */
export type InContextEditorInstaller = <T extends I18n<any>>(i18n: T) => T;

/**
 * Production `.with(…)` installer: host identity, and nothing else.
 *
 * The type is IDENTICAL to the default entry's `inContextEditor`, so the same
 * chain type-checks under both conditions. The body is not: no discovery, no
 * plugin capability, no registration, and no import of `@comvi/core/devtools`
 * or `@comvi/core/plugins` — a production graph carries zero editor bytes AND
 * zero capability bytes.
 *
 * `.use(inContextEditor(…))` is a type error, and here nothing guards it at
 * runtime: the identity function hands the host back and the plugin host's
 * return-shape guard rejects that at `init()`, registering nothing.
 */
export function inContextEditor(_options?: EditorOptions): InContextEditorInstaller {
  return (i18n) => i18n;
}
