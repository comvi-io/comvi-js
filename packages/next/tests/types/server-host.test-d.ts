// The compile-time contract of `createNextI18nFromHost`.
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
import { createI18n } from "@comvi/core";
import { attachLoader, loader } from "@comvi/core/loader";
import type { CreateNextI18nResult } from "../../src/createNextI18n";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const ROUTING = {
  locales: ["en", "fr"],
  defaultLocale: "en",
} satisfies CreateNextI18nFromHostOptions;

// The supplied host type `C` is preserved EXACTLY.
const composedHost = attachLoader(createI18n({ locale: "en", defaultNs: "common" }));
const composed = createNextI18nFromHost(() => composedHost, ROUTING);

export type _ExactHostType = Expect<Equal<typeof composed.i18n, typeof composedHost>>;

// A host composed through the INSTALLER pipe instead of `attachLoader`: the
// second acquisition path.
const installerHost = createI18n({ locale: "en" }).with(loader());
const _onPiped = createNextI18nFromHost(() => installerHost, ROUTING);

export type _PipedHostAlsoExact = Expect<Equal<typeof _onPiped.i18n, typeof installerHost>>;

// The result has NO `.use*` methods — all five of `CreateNextI18nResult`. The
// positive control keeps these five probes from passing vacuously.
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

// The suite-only cell reset is not part of the public server surface.
export type _ResetIsNotPublic = Expect<
  Equal<Extract<keyof typeof serverEntry, "_resetServerI18n">, never>
>;

// The options are routing-only: locale, translations, loader and plugins belong
// to the host factory and do not exist here at all.
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

// The server ALWAYS needs the loader: an uncomposed BASE host — what the plain
// constructor builds — is a compile error.
const bareBaseHost = createI18n({ locale: "en" });

// @ts-expect-error -- NextServerHost = WrapperI18nHost & I18nLoaderApi
createNextI18nFromHost(() => bareBaseHost, ROUTING);

export type _BareBaseIsNotAServerHost = Expect<
  Equal<typeof bareBaseHost extends NextServerHost ? true : false, false>
>;
export type _ComposedIsAServerHost = Expect<
  Equal<typeof composedHost extends NextServerHost ? true : false, true>
>;

// The SINGLE-PACKAGE server recipe: `createI18n` and the capability toolkit are
// re-exported from `@comvi/next/server`, so an SSR app builds a
// `NextServerHost` without ever naming `@comvi/core`.
export type _RetiredNameIsGone = Expect<
  Equal<Extract<keyof typeof serverEntry, "createSlimI18n">, never>
>;

const singlePackageHost = serverEntry.attachLoader(
  serverEntry.createI18n({ locale: "en", defaultNs: "common" }),
);
const _singlePackage = createNextI18nFromHost(() => singlePackageHost, ROUTING);

export type _SinglePackageHostIsExact = Expect<
  Equal<typeof _singlePackage.i18n, typeof singlePackageHost>
>;
export type _SinglePackageHostIsAServerHost = Expect<
  Equal<typeof singlePackageHost extends NextServerHost ? true : false, true>
>;
// The re-exported constructor IS core's base one, so it builds the same bare
// host the two-package recipe did — and the same compile error when unattached.
export type _SinglePackageConstructorIsBase = Expect<
  Equal<typeof serverEntry.createI18n, typeof createI18n>
>;
// @ts-expect-error -- still NextServerHost = WrapperI18nHost & I18nLoaderApi
createNextI18nFromHost(() => serverEntry.createI18n({ locale: "en" }), ROUTING);

// ICU stays injectable from the same specifier, in BOTH shapes: the compiler
// option for an inline catalog, and the pre-ingestion installer for the remote
// catalogs an SSR loader fetches.
void serverEntry.attachLoader(
  serverEntry.createI18n({ locale: "en", compiler: serverEntry.icuCompiler }),
);
void serverEntry.attachLoader(serverEntry.createI18n({ locale: "en" }).with(serverEntry.icu()));
export type _ServerLockedErrorCode = Expect<
  Equal<serverEntry.CompilerLockedError["code"], "E_COMPILER_LOCKED">
>;
const serverFlat: Record<string, string> = serverEntry.flattenCatalog({ nav: { home: "Home" } });
void serverFlat;

// The same recipe through the `.with(installer)` pipe — the sharpest decay
// probe: if the pipe let the host collapse to `any`, the negative case below
// would stop erroring.
const pipedHost = serverEntry
  .createI18n({ locale: "en", defaultNs: "common" })
  .with(serverEntry.loader({ en: async () => ({ default: { hello: "Hello" } }) }));
const _piped = createNextI18nFromHost(() => pipedHost, ROUTING);

export type _PipedHostIsExact = Expect<Equal<typeof _piped.i18n, typeof pipedHost>>;
export type _PipedHostIsAServerHost = Expect<
  Equal<typeof pipedHost extends NextServerHost ? true : false, true>
>;
// `.with(attachLoader)` is the installer for a host with no import map.
void createNextI18nFromHost(
  () => serverEntry.createI18n({ locale: "en" }).with(serverEntry.attachLoader),
  ROUTING,
);
createNextI18nFromHost(
  // @ts-expect-error -- plugins() is not the loader: the server host still needs one
  () => serverEntry.createI18n({ locale: "en" }).with(serverEntry.plugins()),
  ROUTING,
);
