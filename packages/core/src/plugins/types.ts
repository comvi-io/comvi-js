import type { I18n } from "../core/i18n";

/**
 * Plugin Cleanup Function
 *
 * Returned by plugins to clean up resources when Comvi i18n is destroyed
 */
export type PluginCleanup = () => void | Promise<void>;

/**
 * I18n Plugin Function Type
 *
 * Plugins receive the i18n instance and can interact with it directly.
 * They can register hooks, loaders, detectors, and use all public i18n methods.
 *
 * @param i18n - The I18n instance
 * @returns void, Promise<void>, or a cleanup function
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
  i18n: I18n,
) => void | Promise<void> | PluginCleanup | Promise<PluginCleanup>;

/**
 * Plugin Factory - Common pattern for creating configurable plugins
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

/**
 * Options for plugin registration
 */
export interface PluginOptions {
  /**
   * Whether the plugin is required for operation
   * Required plugins will throw errors if they fail
   * Optional plugins will log errors but allow Comvi i18n to continue
   * @default true
   */
  required?: boolean;

  /**
   * Timeout in milliseconds for plugin initialization
   * @default 10000 (10 seconds)
   */
  timeout?: number;

  /**
   * Custom error handler for plugin failures
   */
  onError?: (error: Error) => void;
}
