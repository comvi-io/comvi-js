export { setRequestLocale } from "./server/setRequestLocale";
export { getI18n } from "./server/getI18n";
export { getLocale } from "./server/getLocale";
export { setI18n } from "./server/cache";
export { loadTranslations } from "./server/loadTranslations";

// Exported here and nowhere else: a server loader reached through the host
// factory can then never leak into the client graph.
export { createNextI18nFromHost } from "./server/createNextI18nFromHost";
export type {
  CreateNextI18nFromHostOptions,
  CreateNextI18nFromHostResult,
} from "./server/createNextI18nFromHost";
export type { NextServerHost } from "./server/hostTypes";

export type {
  GetI18nOptions,
  ServerI18n,
  TranslationFunction,
  HasTranslationOptions,
} from "./server/types";

export type { LoadTranslationsOptions, TranslationsResult } from "./server/loadTranslations";

// Pick the installer by what you have: an import map → `loader(map)`; a plain
// `LoaderFn` (or a host something else configures later) →
// `.with(attachLoader)` + `registerLoader(fn)`, because `loader()` statically
// references the import-map adapter and would pull it into a graph that never
// uses it.
//
// NAMED re-exports only, never `export *`: webpack development cannot prune a
// star re-export, and it cannot reconnect a two-package chain either, so every
// binding below comes straight from core.
export { createI18n } from "@comvi/core";
export { icu, icuCompiler } from "@comvi/core/icu";
export type { CompilerLockedError } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";
export type { DevtoolsOptions } from "@comvi/core/devtools";
