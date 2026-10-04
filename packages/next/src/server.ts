// Fails the build when a Client Component imports this entry: Next resolves
// `server-only` to an empty module under the `react-server` condition and to a
// module that throws everywhere else. Apps no longer need their own marker.
import "server-only";

export { setRequestLocale } from "./server/setRequestLocale";
export { getI18n } from "./server/getI18n";
export { getLocale } from "./server/getLocale";
export { setI18n } from "./server/cache";
export { loadMessages } from "./server/loadMessages";
// The layout provider for apps with `withComvi({ config })` in next.config.
export { ComviProvider } from "./server/ComviProvider";
export type { ComviProviderProps } from "./server/ComviProvider";

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
// The name `@comvi/nuxt` uses for the same function type; type-only, 0 B.
export type { TranslationFunction as ServerTranslationFunction } from "./server/types";

export type { LoadMessagesOptions, MessagesMap } from "./server/loadMessages";

// One sentence, two installers: an import map → `loader(map)`; a plain
// `LoaderFn` (or a host something else configures later) →
// `.use(attachLoader)` + `registerLoader(fn)`. The map is required, so there is
// no third form to choose between.
//
// NAMED re-exports only, never `export *`: webpack development cannot prune a
// star re-export, and it cannot reconnect a two-package chain either, so every
// binding below comes straight from core.
export { createI18n } from "@comvi/core";
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, loader } from "@comvi/core/loader";
export { definePlugin, plugins } from "@comvi/core/plugins";
export { devtools } from "@comvi/core/devtools";
export type { DevtoolsOptions } from "@comvi/core/devtools";
// The Next-scoped plugin installers: `runtime` / `environment` on the PLUGIN,
// composed with the same `.use(…)` as everything above.
export { nextPlugin, nextPluginLazy } from "./nextPlugin";
export type { NextPluginOptions, LazyPluginModule, LazyPluginLoader } from "./nextPlugin";
