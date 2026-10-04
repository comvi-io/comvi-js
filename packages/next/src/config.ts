/**
 * `@comvi/next/config`: the specifier the server helpers and the server
 * `ComviProvider` read the app's composition module through.
 *
 * `withComvi({ config })` in next.config aliases this specifier to the app's
 * own module (webpack `resolve.alias`, Turbopack `resolveAlias`), which exports
 * `i18n` and, optionally, `routing`. Without the plugin this stub is what
 * resolves: both are `undefined`, and the server helpers use the once-cell
 * that `setI18n` / `createNextI18nFromHost` fill.
 *
 * Not part of the public API: import your own config module instead.
 */

/** `undefined` until `withComvi({ config })` aliases this module to yours. */
export const i18n: undefined = undefined;

/** `undefined` until `withComvi({ config })` aliases this module to yours. */
export const routing: undefined = undefined;
