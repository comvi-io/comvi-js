import type { I18nPluginHost } from "../types";

/** Returned by a plugin to release its resources when the instance is destroyed. */
export type PluginCleanup = () => void | Promise<void>;

/**
 * A plugin receives the i18n instance and may register hooks, loaders and
 * detectors on it.
 *
 * The host type is the **composed full surface** (`I18nPluginHost`) — the base
 * host plus the loader and plugin capabilities. A plugin only ever runs on a
 * host that has the plugin capability (`@comvi/core/plugins`), and one that
 * calls loader APIs additionally requires `@comvi/core/loader` on that same
 * host. Both only have to be composed by `init()`, which is when plugins run,
 * so their order relative to each other is free —
 * `createI18n({ … }).with(loader()).with(plugins())` and
 * `createI18n({ … }).with(plugins()).with(loader())` are equivalent.
 *
 * @returns Nothing, or a cleanup function.
 *
 * @example
 * ```typescript
 * const MyPlugin = (): I18nPlugin => (i18n) => {
 *   const unsubLocale = i18n.on('localeChanged', () => {
 *     console.log('Locale changed');
 *   });
 *
 *   // Return cleanup function
 *   return () => {
 *     unsubLocale();
 *   };
 * };
 * ```
 */
export type I18nPlugin = (
  i18n: I18nPluginHost,
) => void | Promise<void> | PluginCleanup | Promise<PluginCleanup>;

/**
 * The conventional shape for a configurable plugin.
 *
 * @example
 * ```typescript
 * const FetchLoader = (options: { apiUrl: string }): I18nPlugin => (i18n) => {
 *   i18n.registerLoader(async (locale, ns) => {
 *     const res = await fetch(`${options.apiUrl}/${locale}/${ns}.json`);
 *     return res.json();
 *   });
 * };
 * ```
 */
export type I18nPluginFactory<T = unknown> = (options?: T) => I18nPlugin;

export interface PluginOptions {
  /**
   * A required plugin's failure throws out of `init()`; an optional one's is
   * reported and initialization continues.
   * @default true
   */
  required?: boolean;

  /**
   * Milliseconds allowed for plugin initialization before it is failed.
   * @default 10000
   */
  timeout?: number;

  onError?: (error: Error) => void;
}
