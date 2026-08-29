// Server-only exports for Next.js Server Components
export { setRequestLocale } from "./server/setRequestLocale";
export { getI18n } from "./server/getI18n";
export { getLocale } from "./server/getLocale";
export { setI18n } from "./server/cache";
export { loadTranslations } from "./server/loadTranslations";

// App-composed-host factory (framework-slim 0.5.0). It takes the host YOU
// built, so it composes none of the 0.4 batteries recipe itself.
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

// `@comvi/next/server` — the SSR half of next's single surface, and the same
// shape as `@comvi/next/client`: one specifier carries the host constructor and
// the capability toolkit, so an SSR next app never has to name `@comvi/core`.
// The client/server split is a RUNTIME split, not a host-tier split — the
// constructor below is the SAME base `createI18n` the client entry exports, and
// the single-entry convergence deleted the transitional second name that used to
// stand in for it here (the codemod renames it, §7.2-2).
//
// The host factory `createNextI18nFromHost` takes is the app's own composition
// root, and `NextServerHost = WrapperI18nHost & I18nLoaderApi` means it MUST
// carry the loader, so the pieces to build one are here:
//
// ```ts
// import "server-only";
// import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";
//
// export const { i18n, routing } = createNextI18nFromHost(
//   () => createI18n({ locale: "en", defaultNs: "default" }).with(loader(importMap)),
//   routingOptions,
// );
// ```
//
// `loader(importMap)` composes AND configures in one expression. Pick the
// installer by what you have: an import map → `loader(map)`; a plain
// `LoaderFn` (or a host something else configures later) →
// `.with(attachLoader)` + `registerLoader(fn)`, because `loader()` statically
// references the import-map adapter and would pull it into a graph that never
// uses it (+111 B min+gz on this one — see `fw-next-server-default-loader`).
//
// ICU has TWO shapes here as on the client, and remote catalogs are the common
// SSR case: a catalog the loader fetches takes the INSTALLER, `.with(icu())`,
// and it must run BEFORE the loader can ingest anything — the host locks its
// compiler on the first catalog, after which `icu()` throws own
// `code === "E_COMPILER_LOCKED"` rather than quietly failing. An inline
// constructor catalog takes `compiler: icuCompiler` in the same call instead.
//
// NAMED re-exports of core's own bindings, exactly as on the client entry:
// never `export *` (webpack development cannot prune a star re-export), never
// through another wrapper (it cannot reconnect a two-package chain), and never
// `@comvi/core/tags`, whose import registers tag syntax ambiently. No
// ambient-tag-registering entry is named in this graph at all — that is what
// the `next-server-on-default` matrix case gates: the tag chunks never reach a
// server bundle.
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.with(…)`: one expression composes and configures a capability; the
// `attach*` functions stay as the low-level API.
export { createI18n } from "@comvi/core";
export { icu, icuCompiler } from "@comvi/core/icu";
export type { CompilerLockedError } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";
export type { DevtoolsOptions } from "@comvi/core/devtools";
