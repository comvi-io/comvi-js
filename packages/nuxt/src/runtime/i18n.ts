/**
 * `@comvi/nuxt/i18n` — the composition surface for a `comvi.i18nModule` factory.
 *
 * The documented `comvi.i18n.ts` recipe composes core's installers, but `@comvi/core` is a
 * dependency of THIS package, not of the app: a reader who ran
 * `pnpm add @comvi/nuxt` and nothing else cannot import `@comvi/core/icu`
 * under pnpm's default layout. This subpath is the one hop that makes the
 * recipe followable from that single install.
 *
 * Named re-exports only, one hop straight from `@comvi/core` or one of its
 * pure subpaths — the same re-export discipline the binding roots follow, so
 * nothing here relays a relayed export and `sideEffects: false` still holds.
 * The one local export, `defineComviI18n`, is an identity function for typing.
 *
 * The standalone formatters are here for the same reason: a plain module that
 * formats outside a component imports them from `@comvi/nuxt/i18n`, and the
 * module also registers them as auto-imports.
 *
 * `flattenCatalog` is deliberately NOT here: the base instance flattens a nested
 * catalog itself, so pre-flattening data by hand stays on the `@comvi/core`
 * root rather than becoming the answer to a rule.
 *
 * Neither is the `attachPlugins` / `attachDevtools` pair, for the reason the
 * binding roots dropped it: `plugins()` / `devtools()` are the configured
 * installers a `comvi.i18n.ts` file writes, the pair is the low-level synonym, and it
 * stays on `@comvi/core/plugins` / `@comvi/core/devtools`. `attachLoader` IS
 * here, because it is not a synonym — it is the attach-only loader installer,
 * the one way to compose the capability without also configuring a map.
 */
export { createI18n } from "@comvi/core";
export { formatNumber, formatDate, formatCurrency, formatRelativeTime } from "@comvi/core";
export type { LocaleSource } from "@comvi/core";
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, loader } from "@comvi/core/loader";
export { definePlugin, plugins } from "@comvi/core/plugins";
export { devtools } from "@comvi/core/devtools";

import type { DefaultTranslationParams, WrapperI18nInstance } from "@comvi/core";
import type { NuxtInstanceFactoryOptions } from "../types";

export type { NuxtInstanceFactory } from "../types";

/**
 * Types a `comvi.i18n.ts` default export: `options` is the resolved options
 * nuxt passes, and the factory comes back unchanged, so the composed instance's
 * type still reaches `comvi.setup`. It replaces `satisfies NuxtInstanceFactory`.
 *
 * The factory runs once per instance (the client, and each server request),
 * so it must return a new instance from `createI18n` on every call; in
 * development the module throws when it gets the same instance twice.
 *
 * @example
 * ```ts
 * export default defineComviI18n((options) => createI18n(options).use(loader(map)));
 * ```
 */
export function defineComviI18n<
  C extends WrapperI18nInstance<D>,
  D extends DefaultTranslationParams = {},
>(
  factory: (options: NuxtInstanceFactoryOptions<D>) => C,
): (options: NuxtInstanceFactoryOptions<D>) => C {
  return factory;
}
