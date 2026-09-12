/**
 * `@comvi/nuxt/host` — the composition surface for a `comvi.hostModule` factory.
 *
 * The documented host recipe composes core's installers, but `@comvi/core` is a
 * dependency of THIS package, not of the app: a reader who ran
 * `pnpm add @comvi/nuxt` and nothing else cannot import `@comvi/core/icu`
 * under pnpm's default layout. This subpath is the one hop that makes the
 * recipe followable from that single install.
 *
 * Named re-exports only, one hop straight from `@comvi/core` or one of its
 * pure subpaths — the same re-export discipline the binding roots follow, so
 * nothing here relays a relayed export and `sideEffects: false` still holds.
 *
 * `flattenCatalog` is deliberately NOT here: the base host flattens a nested
 * catalog itself, so pre-flattening data by hand stays on the `@comvi/core`
 * root rather than becoming the answer to a rule.
 *
 * Neither is the `attachPlugins` / `attachDevtools` pair, for the reason the
 * binding roots dropped it: `plugins()` / `devtools()` are the configured
 * installers a host file writes, the pair is the low-level synonym, and it
 * stays on `@comvi/core/plugins` / `@comvi/core/devtools`. `attachLoader` IS
 * here, because it is not a synonym — it is the attach-only loader installer,
 * the one way to compose the capability without also configuring a map.
 */
export { createI18n } from "@comvi/core";
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, loader } from "@comvi/core/loader";
export { definePlugin, plugins } from "@comvi/core/plugins";
export { devtools } from "@comvi/core/devtools";

export type { NuxtHostFactory } from "../types";
