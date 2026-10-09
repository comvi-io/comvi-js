// The compile-time contract of `createNextI18nFromInstance`.
//
// Every import below names `@comvi/next/server` exactly, which is the import
// path the contract fixes (package.json maps `./server` straight to
// `dist/server.js`); the companion is reachable from nowhere else.
import * as serverEntry from "@comvi/next/server";
import { createNextI18nFromInstance } from "@comvi/next/server";
import type {
  CreateNextI18nFromInstanceOptions,
  CreateNextI18nFromInstanceResult,
  NextServerInstance,
} from "@comvi/next/server";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import type { CreateNextI18nResult } from "../../src/createNextI18n";
import type { ServerI18nInstance, ServerTranslatingInstance } from "../../src/server/instanceTypes";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const ROUTING = {
  locales: ["en", "fr"],
  defaultLocale: "en",
} satisfies CreateNextI18nFromInstanceOptions;

// The supplied host type `C` is preserved EXACTLY.
const composedHost = attachLoader(createI18n({ locale: "en", defaultNs: "common" }));
const composed = createNextI18nFromInstance(() => composedHost, ROUTING);

export type _ExactInstanceType = Expect<Equal<typeof composed.i18n, typeof composedHost>>;

// A host composed through the INSTALLER pipe instead of `attachLoader`: the
// second acquisition path.
const installerHost = createI18n({ locale: "en" }).use(attachLoader);
const _onPiped = createNextI18nFromInstance(() => installerHost, ROUTING);

export type _PipedInstanceAlsoExact = Expect<Equal<typeof _onPiped.i18n, typeof installerHost>>;

// The result has NO `.use` pipe (composition belongs in the host factory) and
// none of the four delegates the composed root deleted. The positive control
// keeps these probes from passing vacuously.
export type _ResultIsTwoFields = Expect<
  Equal<keyof CreateNextI18nFromInstanceResult, "i18n" | "routing">
>;
export type _RootResultStillHasUse = Expect<
  Equal<Extract<keyof CreateNextI18nResult, "use">, "use">
>;

// @ts-expect-error -- composition belongs in the host factory
const _use: unknown = composed.use;
// @ts-expect-error -- deleted from the composed root too; never existed here
const _useClient: unknown = composed.useClient;
// @ts-expect-error -- deleted from the composed root too; never existed here
const _useServer: unknown = composed.useServer;
// @ts-expect-error -- deleted from the composed root too; never existed here
const _useClientLazy: unknown = composed.useClientLazy;
// @ts-expect-error -- deleted from the composed root too; never existed here
const _useServerLazy: unknown = composed.useServerLazy;

// `i18n` is a plain readonly field: eager construction, no getter, no reassignment.
// @ts-expect-error -- readonly
composed.i18n = composedHost;

// The suite-only cell reset is not part of the public server surface.
export type _ResetIsNotPublic = Expect<
  Equal<Extract<keyof typeof serverEntry, "_resetServerI18n">, never>
>;

// The options are routing-only: locale, translations, loader and plugins belong
// to the host factory and do not exist here at all.
export type _OptionsAreRoutingOnly = Expect<
  Equal<
    keyof CreateNextI18nFromInstanceOptions,
    "locales" | "defaultLocale" | "localePrefix" | "pathnames"
  >
>;

createNextI18nFromInstance(() => composedHost, {
  locales: ["en"],
  defaultLocale: "en",
  // @ts-expect-error -- owned by the host factory, never silently reapplied
  messages: { en: {} },
});

// The server ALWAYS needs the loader: an uncomposed BASE host — what the plain
// constructor builds — is a compile error.
const bareBaseHost = createI18n({ locale: "en" });

// @ts-expect-error -- NextServerInstance = WrapperI18nInstance & I18nLoaderApi
createNextI18nFromInstance(() => bareBaseHost, ROUTING);

export type _BareBaseIsNotAServerInstance = Expect<
  Equal<typeof bareBaseHost extends NextServerInstance ? true : false, false>
>;
export type _ComposedIsAServerInstance = Expect<
  Equal<typeof composedHost extends NextServerInstance ? true : false, true>
>;

// The SINGLE-PACKAGE server recipe: `createI18n` and the capability toolkit are
// re-exported from `@comvi/next/server`, so an SSR app builds a
// `NextServerInstance` without ever naming `@comvi/core`.
export type _RetiredNameIsGone = Expect<
  Equal<Extract<keyof typeof serverEntry, "createSlimI18n">, never>
>;

const singlePackageHost = serverEntry.attachLoader(
  serverEntry.createI18n({ locale: "en", defaultNs: "common" }),
);
const _singlePackage = createNextI18nFromInstance(() => singlePackageHost, ROUTING);

export type _SinglePackageInstanceIsExact = Expect<
  Equal<typeof _singlePackage.i18n, typeof singlePackageHost>
>;
export type _SinglePackageInstanceIsAServerInstance = Expect<
  Equal<typeof singlePackageHost extends NextServerInstance ? true : false, true>
>;
// The re-exported constructor IS core's base one, so it builds the same bare
// host the two-package recipe did — and the same compile error when unattached.
export type _SinglePackageConstructorIsBase = Expect<
  Equal<typeof serverEntry.createI18n, typeof createI18n>
>;
// @ts-expect-error -- still NextServerInstance = WrapperI18nInstance & I18nLoaderApi
createNextI18nFromInstance(() => serverEntry.createI18n({ locale: "en" }), ROUTING);

// ICU stays injectable from the same specifier, in its ONE shape: the compiler
// option, which covers the remote catalogs an SSR loader fetches too.
void serverEntry.attachLoader(
  serverEntry.createI18n({ locale: "en", compiler: serverEntry.icuCompiler }),
);
export type _NoServerIcuInstaller = Expect<Equal<Extract<keyof typeof serverEntry, "icu">, never>>;
// @ts-expect-error -- `CompilerLockedError` went with the lock it described
export type _NoServerLockedError = serverEntry.CompilerLockedError;
// Nested catalogs are BASE behaviour, so this entry no longer re-exports
// `flattenCatalog` — it lives on the `@comvi/core` root alone (C1).
// @ts-expect-error -- flattenCatalog is not part of this entry
void (serverEntry.flattenCatalog as unknown);
serverEntry.createI18n({ locale: "en", messages: { en: { nav: { home: "Home" } } } });

// The same recipe through the `.use(installer)` pipe — the sharpest decay
// probe: if the pipe let the host collapse to `any`, the negative case below
// would stop erroring.
const pipedHost = serverEntry
  .createI18n({ locale: "en", defaultNs: "common" })
  .use(serverEntry.loader({ en: async () => ({ default: { hello: "Hello" } }) }));
const _piped = createNextI18nFromInstance(() => pipedHost, ROUTING);

export type _PipedInstanceIsExact = Expect<Equal<typeof _piped.i18n, typeof pipedHost>>;
export type _PipedInstanceIsAServerInstance = Expect<
  Equal<typeof pipedHost extends NextServerInstance ? true : false, true>
>;
// `.use(attachLoader)` is the installer for a host with no import map.
void createNextI18nFromInstance(
  () => serverEntry.createI18n({ locale: "en" }).use(serverEntry.attachLoader),
  ROUTING,
);
createNextI18nFromInstance(
  // @ts-expect-error -- plugins() is not the loader: the server host still needs one
  () => serverEntry.createI18n({ locale: "en" }).use(serverEntry.plugins()),
  ROUTING,
);

// ─── The server request contract ────────────────────────────────────────────
//
// `ServerI18nInstance` is the internal instance type the request pipeline reads.
// It carries the CATALOG and the LOADER and nothing else: `t`/`tRaw` are
// deliberately absent, so a server helper cannot translate without naming a
// locale — such a lookup would resolve against the host's process-wide
// `_locale` and leak one request's locale into another request's tree.

export type _ServerInstanceCannotTranslate = Expect<
  Equal<Extract<keyof ServerI18nInstance, "t" | "tRaw">, never>
>;

// The positive control: everything the pipeline DOES read is still on it, so
// the probe above cannot pass by the type having decayed to `never`.
export type _ServerInstanceMembers = Expect<
  Equal<
    keyof ServerI18nInstance,
    | "isInitialized"
    | "init"
    | "getDefaultNamespace"
    | "hasLocale"
    | "hasTranslation"
    | "getMessages"
    | "getFallbackLocales"
    | "getLoader"
    | "reloadMessages"
  >
>;

// A host missing one of those members is not a `ServerI18nInstance`.
export type _MissingGetMessagesRejected = Expect<
  Equal<Omit<ServerI18nInstance, "getMessages"> extends ServerI18nInstance ? true : false, false>
>;

// `getI18n` is the single sanctioned crossing, and it names the widening.
export type _TranslatingInstanceAddsExactlyTheTranslator = Expect<
  Equal<Exclude<keyof ServerTranslatingInstance, keyof ServerI18nInstance>, "t" | "tRaw">
>;

// Every published host still satisfies the narrowed contract structurally.
export type _ComposedInstanceSatisfiesServerInstance = Expect<
  Equal<typeof composedHost extends ServerI18nInstance ? true : false, true>
>;
