// Server-only exports for Next.js Server Components
export { setRequestLocale } from "./server/setRequestLocale";
export { getI18n } from "./server/getI18n";
export { getLocale } from "./server/getLocale";
export { setI18n } from "./server/cache";
export { loadTranslations } from "./server/loadTranslations";

// Root-free composed-host factory (framework-slim 0.5.0). Exported here and
// nowhere else: a server loader reached through the host factory can then
// never leak into the client graph.
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

// The SINGLE-PACKAGE server surface (framework-slim DX pass). The host factory
// `createNextI18nFromHost` takes is the app's own composition root, and
// `NextServerHost = WrapperI18nHost & I18nLoaderApi` means it MUST carry the
// loader — so the pieces to build one are here, and an SSR next app never has
// to name `@comvi/core`:
//
// ```ts
// import "server-only";
// import { createNextI18nFromHost, createSlimI18n, loader } from "@comvi/next/server";
//
// export const { i18n, routing } = createNextI18nFromHost(
//   () => createSlimI18n({ locale: "en", defaultNs: "default" }).with(loader(importMap)),
//   routingOptions,
// );
// ```
//
// `loader(importMap)` composes AND configures in one expression. Pick the
// installer by what you have: an import map → `loader(map)`; a plain
// `LoaderFn` (or a host something else configures later) →
// `.with(attachLoader)` + `registerLoader(fn)`, because `loader()` statically
// references the import-map adapter and would pull it into a graph that never
// uses it (+111 B min+gz on this one — see `fw-next-server-slim-loader`).
//
// NAMED re-exports from core's PURE subpaths only, exactly as on the client
// entry: never `export *` (webpack development cannot prune a star re-export),
// never through another wrapper (it cannot reconnect a two-package chain), and
// never `@comvi/core/tags`, whose import registers tag syntax ambiently. The
// ROOT `@comvi/core` entry is named nowhere in this graph at all — that is what
// the `next-server-on-slim` matrix case gates.
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.with(…)`: one expression composes and configures a capability; the
// `attach*` functions stay as the low-level API.
export { createI18n as createSlimI18n } from "@comvi/core/slim";
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";
export type { DevtoolsOptions } from "@comvi/core/devtools";
