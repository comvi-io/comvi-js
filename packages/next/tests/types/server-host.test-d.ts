// framework-slim P5 step 4 (vi) (vii) (viii) (ix) — the compile-time contract
// of `createNextI18nFromHost`.
//
// Every import below names `@comvi/next/server` exactly, which is the import
// path the contract fixes (package.json maps `./server` straight to
// `dist/server.js`); the companion is reachable from nowhere else.
import * as serverEntry from "@comvi/next/server";
import { createNextI18nFromHost } from "@comvi/next/server";
import type {
  CreateNextI18nFromHostOptions,
  CreateNextI18nFromHostResult,
  NextServerHost,
} from "@comvi/next/server";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { createI18n as createRootI18n } from "@comvi/core";
import type { CreateNextI18nResult } from "../../src/createNextI18n";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const ROUTING = {
  locales: ["en", "fr"],
  defaultLocale: "en",
} satisfies CreateNextI18nFromHostOptions;

// ---------------------------------------------------------------------------
// (vi) The supplied host type `C` is preserved EXACTLY.
// ---------------------------------------------------------------------------
const composedHost = attachLoader(createI18n({ locale: "en", defaultNs: "common" }));
const composed = createNextI18nFromHost(() => composedHost, ROUTING);

export type _ExactHostType = Expect<Equal<typeof composed.i18n, typeof composedHost>>;

const rootHost = createRootI18n({ locale: "en" });
const _onRoot = createNextI18nFromHost(() => rootHost, ROUTING);

export type _RootHostAlsoExact = Expect<Equal<typeof _onRoot.i18n, typeof rootHost>>;

// ---------------------------------------------------------------------------
// (vii) The result has NO `.use*` methods — all five of `CreateNextI18nResult`.
// The positive control keeps these five probes from passing vacuously.
// ---------------------------------------------------------------------------
export type _ResultIsTwoFields = Expect<
  Equal<keyof CreateNextI18nFromHostResult, "i18n" | "routing">
>;
export type _RootResultStillHasUse = Expect<
  Equal<Extract<keyof CreateNextI18nResult, "use">, "use">
>;

// @ts-expect-error -- plugin composition belongs in the host factory
const _use: unknown = composed.use;
// @ts-expect-error -- plugin composition belongs in the host factory
const _useClient: unknown = composed.useClient;
// @ts-expect-error -- plugin composition belongs in the host factory
const _useServer: unknown = composed.useServer;
// @ts-expect-error -- plugin composition belongs in the host factory
const _useClientLazy: unknown = composed.useClientLazy;
// @ts-expect-error -- plugin composition belongs in the host factory
const _useServerLazy: unknown = composed.useServerLazy;

// ---------------------------------------------------------------------------
// (viii) The suite-only cell reset is not part of the public server surface.
// ---------------------------------------------------------------------------
export type _ResetIsNotPublic = Expect<
  Equal<Extract<keyof typeof serverEntry, "_resetServerI18n">, never>
>;

// ---------------------------------------------------------------------------
// Host ownership: the options are routing-only. Locale, translations, loader
// and plugins belong to the host factory and do not exist here at all.
// ---------------------------------------------------------------------------
export type _OptionsAreRoutingOnly = Expect<
  Equal<
    keyof CreateNextI18nFromHostOptions,
    "locales" | "defaultLocale" | "localePrefix" | "pathnames"
  >
>;

createNextI18nFromHost(() => composedHost, {
  locales: ["en"],
  defaultLocale: "en",
  // @ts-expect-error -- owned by the host factory, never silently reapplied
  translation: { en: {} },
});

// ---------------------------------------------------------------------------
// The server ALWAYS needs the loader: a bare-slim host is a compile error.
// ---------------------------------------------------------------------------
const bareSlimHost = createI18n({ locale: "en" });

// @ts-expect-error -- NextServerHost = WrapperI18nHost & I18nLoaderApi
createNextI18nFromHost(() => bareSlimHost, ROUTING);

export type _BareSlimIsNotAServerHost = Expect<
  Equal<typeof bareSlimHost extends NextServerHost ? true : false, false>
>;
export type _ComposedIsAServerHost = Expect<
  Equal<typeof composedHost extends NextServerHost ? true : false, true>
>;

// ---------------------------------------------------------------------------
// framework-slim DX pass: the SINGLE-PACKAGE server recipe. `createSlimI18n`
// and the capability toolkit are re-exported from `@comvi/next/server`, so an
// SSR app builds a `NextServerHost` without ever naming `@comvi/core`.
// ---------------------------------------------------------------------------
const singlePackageHost = serverEntry.attachLoader(
  serverEntry.createSlimI18n({ locale: "en", defaultNs: "common" }),
);
const _singlePackage = createNextI18nFromHost(() => singlePackageHost, ROUTING);

export type _SinglePackageHostIsExact = Expect<
  Equal<typeof _singlePackage.i18n, typeof singlePackageHost>
>;
export type _SinglePackageHostIsAServerHost = Expect<
  Equal<typeof singlePackageHost extends NextServerHost ? true : false, true>
>;
// The re-exported constructor is core-slim's, so it builds the same bare host
// the two-package recipe did — and the same compile error when unattached.
export type _SinglePackageConstructorIsSlim = Expect<
  Equal<typeof serverEntry.createSlimI18n, typeof createI18n>
>;
// @ts-expect-error -- still NextServerHost = WrapperI18nHost & I18nLoaderApi
createNextI18nFromHost(() => serverEntry.createSlimI18n({ locale: "en" }), ROUTING);

// ICU stays injectable from the same specifier.
void serverEntry.attachLoader(
  serverEntry.createSlimI18n({ locale: "en", compiler: serverEntry.icuCompiler }),
);
const serverFlat: Record<string, string> = serverEntry.flattenCatalog({ nav: { home: "Home" } });
void serverFlat;
