// Type-level smoke test: the root, /icu, /rich-text, /tags, /loader, /plugins,
// /devtools and /editor-bridge entries resolve and expose the contracted
// surface. The root is the BASE host, so every capability assertion below is
// about a capability being ABSENT until it is composed in.
import {
  createI18n as createBaseI18n,
  flattenCatalog,
  subscribeToRevision,
  REVISION_EVENTS,
  isVirtualNode as baseIsVirtualNode,
  missingCapability,
  hasLoaderApi,
  hasPluginHostApi,
  type RevisionEvent,
  type RevisionEventSource,
  type CapabilityName,
  type WrapperI18nHost,
} from "@comvi/core";
import {
  acquireLoaderApi,
  attachLoader,
  createImportMapLoader,
  loader,
  type AcquiredLoaderApi,
  type I18nLoaderApi,
  type LoaderFn,
} from "@comvi/core/loader";
import * as loaderEntry from "@comvi/core/loader";
import {
  attachDevtools,
  devtools,
  type ComviHook,
  type ComviQueue,
  type ComviQueueEntry,
  type DevtoolsOptions,
} from "@comvi/core/devtools";
import {
  acquirePluginsApi,
  attachPlugins,
  definePlugin,
  plugins,
  type AcquiredPluginsApi,
  type I18nPlugin,
  type I18nPluginHostApi,
} from "@comvi/core/plugins";
import { icuCompiler, type MessageCompiler } from "@comvi/core/icu";
import {
  registerTagSyntax,
  tagSyntaxExtension,
  createElement,
  isVirtualNode,
  prepareTranslation as tagsPrepareTranslation,
  type SyntaxExtension,
  type VirtualNode,
} from "@comvi/core/tags";
import {
  prepareTranslation,
  getPendingHandlerName,
  childrenToArray,
  createFragment,
  type PendingHandler,
  type PrepareTranslationProps,
  type PreparedTranslation,
  type PrepareTranslationSource,
  type TagComponentsMap,
  type TranslationResult,
} from "@comvi/core/rich-text";
import {
  EDITOR_MAPPINGS_GLOBAL,
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  toRecordOfNumbers,
  readEditorMappings,
  type InContextEditorMappings,
} from "@comvi/core/editor-bridge";
import { createI18n } from "@comvi/core";

// base: plain options, missingParam option, and compiler injection all type.
const slim = createBaseI18n({ locale: "en" });
// (TranslationKeys is augmented by translation-keys.test-d.ts in this program.)
slim.t("count", { count: 1 });
createBaseI18n({ locale: "en", missingParam: "drop" });
createBaseI18n({ locale: "en", compiler: icuCompiler });

// icu: the compiler satisfies the (internal, subpath-exported) contract type.
const compiler: MessageCompiler = icuCompiler;
void compiler;

// tags: registration returns a disposer; the extension object is passable
// through the per-call channel; VirtualNode toolbox is typed.
const dispose: () => void = registerTagSyntax();
dispose();
const ext: SyntaxExtension = tagSyntaxExtension;
createI18n({ locale: "en", tagInterpolation: { extensions: [ext] } });
const node: VirtualNode = createElement("strong", {}, ["hi"]);
if (isVirtualNode(node)) {
  node.type satisfies "element" | "text" | "fragment";
}

// The pure `<T>` seam types independently of the ambient entry, and
// `@comvi/core/tags` re-exports the SAME declarations — that assignability IS
// the backward-compatibility contract of the split.
declare const richSource: PrepareTranslationSource;
const richProps: PrepareTranslationProps = { i18nKey: "msg", components: { link: "a" } };
const prepared: PreparedTranslation = prepareTranslation(richSource, richProps);
prepared.content satisfies TranslationResult;
prepared.pendingHandlers satisfies PendingHandler[];
const handlerName: string | undefined = getPendingHandlerName("__comvi_handler_link__");
void handlerName;
const richChildren: (string | VirtualNode)[] = childrenToArray(prepared.content);
richChildren.push(createFragment(["x"]));
const componentsMap: TagComponentsMap = { link: "a" };
void componentsMap;
// Interchangeable in a consumer's type positions.
const viaTags: typeof prepareTranslation = tagsPrepareTranslation;
void viaTags;

// root: missingParam is part of the base options.
createI18n({ locale: "en", missingParam: "literal" });

// @ts-expect-error — missingParam only accepts "literal" | "drop"
createI18n({ locale: "en", missingParam: "silent" });

// editor-bridge: constants are literal-typed; the guard narrows to the
// bridge interface; the validator returns a numeric record or undefined.
EDITOR_MAPPINGS_GLOBAL satisfies "__comviInContextEditorMappings";
EDITOR_INITIAL_MAPPINGS_GLOBAL satisfies "__comviInContextEditorInitialMappings";
const maybeMappings: Record<string, number> | undefined = toRecordOfNumbers({ a: 1 });
void maybeMappings;
const bridge: InContextEditorMappings | undefined = readEditorMappings(
  createI18n({ locale: "en" }),
);
if (bridge) {
  const snapshot: Record<string, number> = bridge.getKeyMappings();
  bridge.loadKeyMappings(snapshot);
}

// @ts-expect-error — the guard result may be undefined; direct call must not type
readEditorMappings({}).getKeyMappings();

// ── /loader: the composition surface ─────────────────────────────────────

// A bare slim instance genuinely lacks the loader capability.
// @ts-expect-error — registerLoader lives in @comvi/core/loader
slim.registerLoader(async () => ({}));
// @ts-expect-error — reloadTranslations lives in @comvi/core/loader
slim.reloadTranslations();

// Namespace activation and the loadError wrapper are loader-domain, so they are
// absent from a bare instance.
// @ts-expect-error — addActiveNamespace lives in @comvi/core/loader
slim.addActiveNamespace("common");
// @ts-expect-error — addActiveNamespaces lives in @comvi/core/loader
slim.addActiveNamespaces(["common"]);
// @ts-expect-error — removeActiveNamespace lives in @comvi/core/loader
slim.removeActiveNamespace("common");
// @ts-expect-error — removeActiveNamespaces lives in @comvi/core/loader
slim.removeActiveNamespaces(["common"]);
// @ts-expect-error — onLoadError lives in @comvi/core/loader
slim.onLoadError(() => {});

// attachLoader returns the instance widened with the loader API.
const withLoader = attachLoader(createBaseI18n({ locale: "en" }));
const loaderFn: LoaderFn = async () => ({ hello: "world" });
withLoader.registerLoader(loaderFn);
const registered: LoaderFn | undefined = withLoader.getLoader();
void registered;
void withLoader.reloadTranslations("en", "default");
void withLoader.addActiveNamespaces(["common"]);
withLoader.removeActiveNamespace("common");
withLoader.removeActiveNamespaces(["common"]);
withLoader.onLoadError(() => {});
// the base surface survives the widening
withLoader.t("count", { count: 1 });

// createImportMapLoader now lives in /loader and produces a plain LoaderFn.
const mapLoader: LoaderFn = createImportMapLoader(
  { en: async () => ({ default: { hello: "world" } }) },
  () => "default",
);
withLoader.registerLoader(mapLoader);

// The import-map form is the CONFIGURED installer's job: the base root has no
// `registerLoader` at all, and the loader capability's signature takes a
// `LoaderFn`. `@comvi/next`'s composed host restores the two-overload shape.
const mapConfigured = createBaseI18n({ locale: "en" }).use(
  loader({ en: async () => ({ hello: "world" }) }),
);
void mapConfigured.getLoader();

// ── /plugins: the plugin-host surface ────────────────────────────────────

// A bare slim instance genuinely lacks the plugin host.
// @ts-expect-error — use() lives in @comvi/core/plugins
slim.registerPlugin(() => {});
// @ts-expect-error — registerPostProcessor lives in @comvi/core/plugins
slim.registerPostProcessor((r) => r);
// @ts-expect-error — setPluginData lives in @comvi/core/plugins
slim.setPluginData("k", 1);

// The attach chain composes: loader first, then the plugin host that may run
// loader-registering plugins.
const composed = attachPlugins(attachLoader(createBaseI18n({ locale: "en" })));
composed.registerLoader(loaderFn);
composed.registerPlugin(() => {});
composed.registerLocaleDetector(() => "fr");
const detector: (() => string | Promise<string>) | undefined = composed.getLanguageDetector();
void detector;
const disposeMiss: () => void = composed.onMissingKey(() => "fallback");
disposeMiss();
composed.registerPostProcessor((result) => result);
composed.setPluginData("cfg", { a: 1 });
const cfg: { a: number } | undefined = composed.getPluginData<{ a: number }>("cfg");
void cfg;
// the base surface survives both widenings, and `use` stays chainable
composed.registerPlugin(() => {}).t("count", { count: 1 });

// A fetch-loader-shaped plugin (registers a loader + stores plugin data
// through the host) compiles and can be hosted by the composed slim chain.
const fetchLoaderShaped: I18nPlugin = (i18n) => {
  i18n.setPluginData("fetchLoader", { projectId: "p" });
  i18n.registerLoader(async () => ({ hello: "world" }));
};
composed.registerPlugin(fetchLoaderShaped);
// @ts-expect-error — the base root is not a plugin host until `.use(plugins())`
createBaseI18n({ locale: "en" }).registerPlugin(fetchLoaderShaped);

// Every value a wrapper runtime module needs resolves through the single root
// entry, which is side-effect-free — so reaching for a helper costs a wrapper
// nothing beyond the helper.
const disposeRevision: () => void = subscribeToRevision(slim, (event) => {
  event satisfies RevisionEvent;
});
disposeRevision();
REVISION_EVENTS satisfies readonly RevisionEvent[];
const source: RevisionEventSource = slim;
void source;

const maybeNode: unknown = { type: "text", text: "hi" };
if (baseIsVirtualNode(maybeNode)) {
  maybeNode.type satisfies "element" | "text" | "fragment";
}

// The host alias reaches /slim consumers, and bare slim satisfies it.
const slimHost: WrapperI18nHost = slim;
void slimHost;

// The structural guards narrow a host to the capability surface.
const capabilityName: CapabilityName = "loader";
const failure: Error = missingCapability(capabilityName);
void failure;

if (hasLoaderApi(slimHost)) {
  void slimHost.reloadTranslations();
  void slimHost.addActiveNamespaces(["common"]);
  slimHost.removeActiveNamespaces(["common"]);
}
if (hasPluginHostApi(slimHost)) {
  slimHost.registerPostProcessor((result) => result);
  slimHost.setPluginData("cfg", 1);
}

// A composed host is still a wrapper host — the alias never narrows away.
const composedHost: WrapperI18nHost = composed;
void composedHost;

// ── /devtools: the discovery capability ──────────────────────────────────
//
// A bare slim instance has no discovery code at all: `instanceId` is declared
// on the class (it is part of `I18nCoreExtraApi`) and stays `undefined` until
// the capability assigns it.
const bareId: string | undefined = slim.instanceId;
void bareId;

// attachDevtools returns the SAME instance type — discovery adds no public
// members, it only populates one the host already declares.
const withDevtools: typeof slim = attachDevtools(slim);
const attachedId: string | undefined = withDevtools.instanceId;
void attachedId;
attachDevtools(createBaseI18n({ locale: "en" }), { instanceId: "app", exposeGlobal: false });
const devtoolsOptions: DevtoolsOptions = { exposeGlobal: true };
void devtoolsOptions;

// @ts-expect-error — DevtoolsOptions has no `locale`
attachDevtools(slim, { locale: "en" });

// The queue contract is reachable from the subpath that produces it.
const queueEntry: ComviQueueEntry = { v: "0.5.0", i: createI18n({ locale: "en" }) };
const queue: ComviQueue = [queueEntry];
void (queue satisfies ComviQueueEntry[] | ComviHook);

// ── nested catalogs: BASE behaviour, no escape hatch needed (C1) ─────────
createBaseI18n({ locale: "en", translation: { en: { nav: { home: "Home" } } } });
createBaseI18n({ locale: "en" }).addTranslations({ en: { nav: { home: "Home" } } });

// `flattenCatalog` stays published, from the ROOT only, for hand-flattening.
// @ts-expect-error — flattenCatalog is no longer part of @comvi/core/loader
void (loaderEntry.flattenCatalog as unknown);
const flat: Record<string, string> = flattenCatalog({ nav: { home: "Home" } });
createBaseI18n({ locale: "en" }).addTranslations({ en: flat });

// ── `.use(…)`: the composition pipe + configured installers (fs-dx2) ─────
//
// `with` is on the BASE class, so it is always present and always just
// `f(this)`. Everything below is about ONE property: the generic host type
// must flow THROUGH the pipe and come out widened, never decayed to `any`.

// The target DX, verbatim: one expression, capability configured in place.
const piped = createBaseI18n({ locale: "en", compiler: icuCompiler }).use(
  loader({ uk: async () => ({ default: { hello: "Привіт" } }) }),
);
piped.registerLoader(loaderFn);
const pipedLoader: LoaderFn | undefined = piped.getLoader();
void pipedLoader;
void piped.reloadTranslations("uk", "default");
piped.onLoadError(() => {});

// THE DECAY PROBE. `D` is empty here, so `review` still requires its
// `formality` param. If `.use` let the host collapse to `any`, this call
// would succeed and the directive would report itself as unused.
// @ts-expect-error — D survives the pipe: no constructor defaults were given
piped.t("review");
piped.t("review", { formality: "formal" });

// …and the positive half: a host constructed WITH defaults keeps them across
// the pipe, which `any` could never distinguish from the line above.
const pipedWithDefaults = createBaseI18n({
  locale: "en",
  defaultParams: { formality: "formal" },
}).use(attachLoader);
pipedWithDefaults.t("review");
pipedWithDefaults.registerLoader(loaderFn);

// Chaining compounds the widenings; the base surface survives both.
const pipedBoth = createBaseI18n({ locale: "en" }).use(attachLoader).use(plugins());
pipedBoth.registerLoader(loaderFn);
pipedBoth.registerPlugin(fetchLoaderShaped).t("count", { count: 1 });
pipedBoth.registerPostProcessor((result) => result);
const pipedBothHost: WrapperI18nHost = pipedBoth;
void pipedBothHost;

// Order is the caller's; the type compounds either way.
const pipedReversed = createBaseI18n({ locale: "en" }).use(plugins()).use(attachLoader);
pipedReversed.registerPlugin(() => {});
pipedReversed.registerLoader(loaderFn);

// The addendum's plugin-ecosystem guarantee, at the type level:
// `registerPlugin` is a compile error until `plugins()` is composed in, and
// present afterwards. `.use` itself is on the BASE host and always there.
const pipedLoaderOnly = createBaseI18n({ locale: "en" }).use(attachLoader);
// @ts-expect-error — use() arrives with @comvi/core/plugins, not with the loader
pipedLoaderOnly.registerPlugin(fetchLoaderShaped);
pipedLoaderOnly.use(plugins()).registerPlugin(fetchLoaderShaped);

// devtools() adds no public members: the host type comes back unchanged.
const pipedDevtools: typeof slim = slim.use(devtools({ exposeGlobal: false }));
void pipedDevtools;

// The low-level attaches ARE installers — the factories only add config.
createBaseI18n({ locale: "en" }).use(attachLoader).registerLoader(loaderFn);
createBaseI18n({ locale: "en" })
  .use(attachPlugins)
  .registerPlugin(() => {});
createBaseI18n({ locale: "en" }).use(attachDevtools).t("count", { count: 1 });

// A hand-written installer is just a function; nothing is branded or
// registered, so a user's own composition step needs no core import. It must
// widen the host IN PLACE and return IT — a derived object is refused at
// runtime with `E_USE_NOT_INSTALLER`, so the extra it produces lives beside
// the chain rather than in the return value.
let unsubscribeHandwritten: () => void = () => {};
const withRevision = createBaseI18n({ locale: "en" }).use((i18n) => {
  unsubscribeHandwritten = subscribeToRevision(i18n, () => {});
  return i18n as typeof i18n & { readonly revisionSubscribed: true };
});
unsubscribeHandwritten();
withRevision.revisionSubscribed satisfies true;
withRevision.t("count", { count: 1 });

// FUTURE-PROOFING (fs-dx2 contract 2): the parameter is the widest honest
// shape — any `(host) => value`. A branded installer, which is how published
// plugin packages are expected to become directly `.use`-able, therefore
// already flows through unchanged and needs no overload today.
interface BrandedInstaller<A> {
  <T extends object>(host: T): T & A;
  readonly __comviInstaller: unique symbol;
}
declare const brandedFetchLoader: BrandedInstaller<{ readonly fetchLoaderConfigured: true }>;
const pipedBranded = createBaseI18n({ locale: "en" }).use(brandedFetchLoader);
pipedBranded.fetchLoaderConfigured satisfies true;

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// `registerPlugin` is the plugin host's member under its post-E name, and
// `use` is NOT on that API: the queue and the composition verb are two
// different members with two different contracts (`use` is on the BASE host).
export type _RegisterPluginIsOnTheApi = Expect<
  Equal<"registerPlugin" extends keyof I18nPluginHostApi ? true : false, true>
>;
export type _RegisterPluginArg = Expect<
  Equal<Parameters<I18nPluginHostApi["registerPlugin"]>[0], I18nPlugin>
>;
export type _ApiHasNoUse = Expect<
  Equal<"use" extends keyof I18nPluginHostApi ? true : false, false>
>;

// `definePlugin(fn)` is an installer, so it satisfies `.use`'s parameter and
// widens the host by exactly the plugin-host API.
const withDefinedPlugin = createBaseI18n({ locale: "en" }).use(definePlugin(() => {}));
export type _DefinePluginWidensToThePluginHost = Expect<
  Equal<typeof withDefinedPlugin extends I18nPluginHostApi ? true : false, true>
>;
withDefinedPlugin.registerPlugin(() => {});
// It takes the same options the queue does.
createBaseI18n({ locale: "en" }).use(definePlugin(() => {}, { required: false, timeout: 50 }));
// @ts-expect-error — definePlugin takes a PLUGIN, not an installer
createBaseI18n({ locale: "en" }).use(definePlugin(attachLoader));
pipedBranded.t("count", { count: 1 });

// Composing both capabilities onto the base root widens it to the full
// surface, and the widened host accepts a plain LoaderFn plus plugins.
const fullyPiped = createBaseI18n({ locale: "en" }).use(attachLoader).use(plugins());
fullyPiped.registerLoader(loaderFn);
fullyPiped.registerPlugin(fetchLoaderShaped);

// ── wrong installer shapes ────────────────────────────────────────────────

// @ts-expect-error — the FACTORY is not an installer; it must be called
createBaseI18n({ locale: "en" }).use(loader);
// @ts-expect-error — an installer is a function, not a value
createBaseI18n({ locale: "en" }).use(attachLoader(createBaseI18n({ locale: "en" })));
// @ts-expect-error — a PLUGIN is not an installer: it demands a plugin host,
// which a bare slim instance is not (that is what `.use(plugins())` fixes)
createBaseI18n({ locale: "en" }).use(fetchLoaderShaped);
// @ts-expect-error — an import map's values must be import functions
createBaseI18n({ locale: "en" }).use(loader({ uk: "./uk.json" }));
// THE ATTACH-ONLY RULE, at the type level: the import map is REQUIRED, so
// there is exactly one attach-only installer and it is `attachLoader`. A bare
// `loader()` is the shape this decision deletes.
// @ts-expect-error — loader() needs the import map; .use(attachLoader) is attach-only
createBaseI18n({ locale: "en" }).use(loader());
// @ts-expect-error — and an EXPLICIT undefined is the same mistake, spelled out
createBaseI18n({ locale: "en" }).use(loader(undefined));
// @ts-expect-error — devtools() takes DevtoolsOptions, not I18nOptions
createBaseI18n({ locale: "en" }).use(devtools({ locale: "en" }));
// @ts-expect-error — plugins() takes no configuration yet
createBaseI18n({ locale: "en" }).use(plugins({ strict: true }));

// ── the identity rule, at the TYPE level ──────────────────────────────────
//
// `use<T extends this>` makes all three runtime misuses of `E_USE_NOT_INSTALLER`
// compile errors instead. The POSITIVE side of the same constraint is pinned
// above: `loader(map)`, `plugins()`, `definePlugin()`, a bare `attachLoader` /
// `attachPlugins` / `attachDevtools`, the hand-written in-place installer with
// its phantom brand, and the `BrandedInstaller<A>` probe all still infer and
// widen through it. The runtime guard is NOT redundant — a JS caller, or an
// `any`-typed one, walks straight past every line here.

// 1. A DERIVED object: the classic pre-E hand-written shape. Widen in place and
//    keep the extra beside the chain.
createBaseI18n({ locale: "en" }).use(
  // @ts-expect-error — a derived object is not the host
  (i18n) => ({ i18n, dispose: () => {} }),
);

// 2. An ASYNC installer: calling it yields a Promise, never the host. This is
//    the shape a raw `FetchLoader(…)`-style plugin has.
// @ts-expect-error — an async function returns a Promise, not the host
createBaseI18n({ locale: "en" }).use(async (i18n) => i18n);

// 3. An installer that returns NOTHING — a statement body, which is what a
//    hand-written plugin looks like.
// @ts-expect-error — an installer must return the host it was given
createBaseI18n({ locale: "en" }).use((i18n) => {
  void i18n;
});

// ── the capability ACQUIRERS: one component-side surface per subpath ──────
//
// These carry the typing rules the deleted text-diff gate used to read out of
// four copied source regions. `onMissingKey` is the one that actually drifted,
// and it drifted in TYPES: a wrapper-side `String(result)` narrowed core's
// `TranslationResult | void` to a string in one framework only.

export type _AcquiredLoaderIsTheAcquirersReturn = Expect<
  Equal<ReturnType<typeof acquireLoaderApi>, AcquiredLoaderApi>
>;
export type _AcquiredPluginsIsTheAcquirersReturn = Expect<
  Equal<ReturnType<typeof acquirePluginsApi>, AcquiredPluginsApi>
>;

// Every member is core's own declaration, indexed straight off the capability
// API — never a re-typed copy.
export type _OnMissingKeyIsCoresType = Expect<
  Equal<AcquiredPluginsApi["onMissingKey"], I18nPluginHostApi["onMissingKey"]>
>;
export type _LoaderMembersAreCoresTypes = Expect<
  Equal<AcquiredLoaderApi, Pick<I18nLoaderApi, keyof AcquiredLoaderApi>>
>;

// NOT coerced: a callback may return the `Array<string | VirtualNode>` half of
// `TranslationResult`, which a `string`-narrowed member would reject.
declare const acquiredPlugins: AcquiredPluginsApi;
const offRich: () => void = acquiredPlugins.onMissingKey(() => [
  "rich-",
  createElement("b", {}, ["fallback"]),
]);
offRich();

// The registration-time APIs are deliberately absent from both bags: wiring
// belongs where the instance is constructed, not in a component.
export type _NoRegisterLoaderOnTheBag = Expect<
  Equal<"registerLoader" extends keyof AcquiredLoaderApi ? true : false, false>
>;
export type _NoRegisterPluginOnTheBag = Expect<
  Equal<"registerPlugin" extends keyof AcquiredPluginsApi ? true : false, false>
>;

// A bare host is refused at the CALL only at runtime — the parameter is the
// wrapper host type, so every binding can hand its context host straight in.
declare const anyWrapperHost: WrapperI18nHost;
void acquireLoaderApi(anyWrapperHost);
void acquirePluginsApi(anyWrapperHost);
