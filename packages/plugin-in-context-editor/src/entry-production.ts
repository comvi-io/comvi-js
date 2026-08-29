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
 * The type is IDENTICAL to the default entry's `inContextEditor` — same name,
 * same signature, same `InContextEditorInstaller` — so a `.with(inContextEditor())`
 * chain type-checks and behaves the same under both conditions. What differs
 * is the whole body: no discovery, no plugin capability, no plugin
 * registration, no imports of `@comvi/core/devtools` or `@comvi/core/plugins`,
 * so a production graph carries zero editor bytes AND zero capability bytes.
 * This matches the uppercase production no-op above, which returns a plugin
 * that does nothing.
 *
 * WRONG USE. `.use(inContextEditor(…))` is a type error, and here there is no
 * ensure-step to reject it — the identity function has nothing to guard. It
 * runs, hands the host back, and the plugin host's return-shape guard rejects
 * that at `init()`: a plugin may only return nothing or a cleanup function.
 * Nothing is registered and no cleanup is queued.
 */
export function inContextEditor(_options?: EditorOptions): InContextEditorInstaller {
  return (i18n) => i18n;
}
