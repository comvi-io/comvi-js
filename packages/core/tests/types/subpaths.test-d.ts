// Type-level smoke test: the /slim, /icu, /tags, /devtools and
// /editor-bridge subpaths resolve and expose the contracted surface.
// (Published-artifact resolution under moduleResolution bundler/node16 is
// exercised by attw/publint and the bundler-matrix job against dist.)
import {
  createI18n as createSlimI18n,
  subscribeToRevision,
  REVISION_EVENTS,
  isVirtualNode as slimIsVirtualNode,
  missingCapability,
  hasLoaderApi,
  hasPluginHostApi,
  type RevisionEvent,
  type RevisionEventSource,
  type CapabilityName,
  type WrapperI18nHost,
} from "@comvi/core/slim";
import {
  attachLoader,
  createImportMapLoader,
  flattenCatalog,
  loader,
  type LoaderFn,
} from "@comvi/core/loader";
import {
  attachDevtools,
  devtools,
  type ComviHook,
  type ComviQueue,
  type ComviQueueEntry,
  type DevtoolsOptions,
} from "@comvi/core/devtools";
import { attachPlugins, plugins, type I18nPlugin } from "@comvi/core/plugins";
import { icuCompiler, type MessageCompiler } from "@comvi/core/icu";
import {
  registerTagSyntax,
  tagSyntaxExtension,
  createElement,
  isVirtualNode,
  type SyntaxExtension,
  type VirtualNode,
} from "@comvi/core/tags";
import {
  EDITOR_MAPPINGS_GLOBAL,
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  toRecordOfNumbers,
  readEditorMappings,
  type InContextEditorMappings,
} from "@comvi/core/editor-bridge";
import { createI18n } from "@comvi/core";

// slim: plain options, missingParam option, and compiler injection all type.
const slim = createSlimI18n({ locale: "en" });
// (TranslationKeys is augmented by default-params.test-d.ts in this program.)
slim.t("count", { count: 1 });
createSlimI18n({ locale: "en", missingParam: "drop" });
createSlimI18n({ locale: "en", compiler: icuCompiler });

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

// ── /loader: the composition surface (Phase 7) ────────────────────────────

// A bare slim instance genuinely lacks the loader capability.
// @ts-expect-error — registerLoader lives in @comvi/core/loader
slim.registerLoader(async () => ({}));
// @ts-expect-error — reloadTranslations lives in @comvi/core/loader
slim.reloadTranslations();

// Contingencies C1/C2: namespace activation and the loadError wrapper are
// loader-domain and absent from a bare slim instance.
// @ts-expect-error — addActiveNamespace lives in @comvi/core/loader (C1)
slim.addActiveNamespace("common");
// @ts-expect-error — addActiveNamespaces lives in @comvi/core/loader (C1)
slim.addActiveNamespaces(["common"]);
// @ts-expect-error — onLoadError lives in @comvi/core/loader (C2)
slim.onLoadError(() => {});

// attachLoader returns the instance widened with the loader API.
const withLoader = attachLoader(createSlimI18n({ locale: "en" }));
const loaderFn: LoaderFn = async () => ({ hello: "world" });
withLoader.registerLoader(loaderFn);
const registered: LoaderFn | undefined = withLoader.getLoader();
void registered;
void withLoader.reloadTranslations("en", "default");
void withLoader.addActiveNamespaces(["common"]);
withLoader.onLoadError(() => {});
// the base surface survives the widening
withLoader.t("count", { count: 1 });

// createImportMapLoader now lives in /loader and produces a plain LoaderFn.
const mapLoader: LoaderFn = createImportMapLoader(
  { en: async () => ({ default: { hello: "world" } }) },
  () => "default",
);
withLoader.registerLoader(mapLoader);

// The root entry keeps accepting an import map directly.
createI18n({ locale: "en" }).registerLoader({ en: async () => ({ hello: "world" }) });

// ── /plugins: the plugin-host surface (Phase 7) ───────────────────────────

// A bare slim instance genuinely lacks the plugin host.
// @ts-expect-error — use() lives in @comvi/core/plugins
slim.use(() => {});
// @ts-expect-error — registerPostProcessor lives in @comvi/core/plugins
slim.registerPostProcessor((r) => r);
// @ts-expect-error — setPluginData lives in @comvi/core/plugins
slim.setPluginData("k", 1);

// The attach chain composes: loader first, then the plugin host that may run
// loader-registering plugins (README ordering warning / R8).
const composed = attachPlugins(attachLoader(createSlimI18n({ locale: "en" })));
composed.registerLoader(loaderFn);
composed.use(() => {});
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
composed.use(() => {}).t("count", { count: 1 });

// A fetch-loader-shaped plugin (registers a loader + stores plugin data
// through the host) compiles and can be hosted by the composed slim chain.
const fetchLoaderShaped: I18nPlugin = (i18n) => {
  i18n.setPluginData("fetchLoader", { projectId: "p" });
  i18n.registerLoader(async () => ({ hello: "world" }));
};
composed.use(fetchLoaderShaped);
createI18n({ locale: "en" }).use(fetchLoaderShaped);

// ── /slim: the framework-slim P1 wrapper enablers ─────────────────────────
//
// Every value a wrapper runtime module needs today resolves through /slim, so
// no wrapper has to pin the root entry (and, with it, the ambient
// `register-tags` side effect) just to reach a helper.
const disposeRevision: () => void = subscribeToRevision(slim, (event) => {
  event satisfies RevisionEvent;
});
disposeRevision();
REVISION_EVENTS satisfies readonly RevisionEvent[];
const source: RevisionEventSource = slim;
void source;

const maybeNode: unknown = { type: "text", text: "hi" };
if (slimIsVirtualNode(maybeNode)) {
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
}
if (hasPluginHostApi(slimHost)) {
  slimHost.registerPostProcessor((result) => result);
  slimHost.setPluginData("cfg", 1);
}

// A composed host is still a wrapper host — the alias never narrows away.
const composedHost: WrapperI18nHost = composed;
void composedHost;

// ── /devtools: the discovery capability (framework-slim tier-3, C1) ───────
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
attachDevtools(createSlimI18n({ locale: "en" }), { instanceId: "app", exposeGlobal: false });
const devtoolsOptions: DevtoolsOptions = { exposeGlobal: true };
void devtoolsOptions;

// @ts-expect-error — DevtoolsOptions has no `locale`
attachDevtools(slim, { locale: "en" });

// The queue contract is reachable from the subpath that produces it.
const queueEntry: ComviQueueEntry = { v: "0.5.0", i: createI18n({ locale: "en" }) };
const queue: ComviQueue = [queueEntry];
void (queue satisfies ComviQueueEntry[] | ComviHook);

// ── flattenCatalog: the bare-host escape hatch for nested catalogs (C6) ───
const flat: Record<string, string> = flattenCatalog({ nav: { home: "Home" } });
createSlimI18n({ locale: "en" }).addTranslations({ en: flat });

// ── `.with(…)`: the composition pipe + configured installers (fs-dx2) ─────
//
// `with` is on the BASE class, so it is always present and always just
// `f(this)`. Everything below is about ONE property: the generic host type
// must flow THROUGH the pipe and come out widened, never decayed to `any`.

// The target DX, verbatim: one expression, capability configured in place.
const piped = createSlimI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: async () => ({ default: { hello: "Привіт" } }) }),
);
piped.registerLoader(loaderFn);
const pipedLoader: LoaderFn | undefined = piped.getLoader();
void pipedLoader;
void piped.reloadTranslations("uk", "default");
piped.onLoadError(() => {});

// THE DECAY PROBE. `D` is empty here, so `review` still requires its
// `formality` param. If `.with` let the host collapse to `any`, this call
// would succeed and the directive would report itself as unused.
// @ts-expect-error — D survives the pipe: no constructor defaults were given
piped.t("review");
piped.t("review", { formality: "formal" });

// …and the positive half: a host constructed WITH defaults keeps them across
// the pipe, which `any` could never distinguish from the line above.
const pipedWithDefaults = createSlimI18n({
  locale: "en",
  defaultParams: { formality: "formal" },
}).with(loader());
pipedWithDefaults.t("review");
pipedWithDefaults.registerLoader(loaderFn);

// Chaining compounds the widenings; the base surface survives both.
const pipedBoth = createSlimI18n({ locale: "en" }).with(loader()).with(plugins());
pipedBoth.registerLoader(loaderFn);
pipedBoth.use(fetchLoaderShaped).t("count", { count: 1 });
pipedBoth.registerPostProcessor((result) => result);
const pipedBothHost: WrapperI18nHost = pipedBoth;
void pipedBothHost;

// Order is the caller's; the type compounds either way.
const pipedReversed = createSlimI18n({ locale: "en" }).with(plugins()).with(loader());
pipedReversed.use(() => {});
pipedReversed.registerLoader(loaderFn);

// The addendum's plugin-ecosystem guarantee, at the type level: `.use` is a
// compile error until `plugins()` is composed in, and present afterwards.
const pipedLoaderOnly = createSlimI18n({ locale: "en" }).with(loader());
// @ts-expect-error — use() arrives with @comvi/core/plugins, not with the loader
pipedLoaderOnly.use(fetchLoaderShaped);
pipedLoaderOnly.with(plugins()).use(fetchLoaderShaped);

// devtools() adds no public members: the host type comes back unchanged.
const pipedDevtools: typeof slim = slim.with(devtools({ exposeGlobal: false }));
void pipedDevtools;

// The low-level attaches ARE installers — the factories only add config.
createSlimI18n({ locale: "en" }).with(attachLoader).registerLoader(loaderFn);
createSlimI18n({ locale: "en" })
  .with(attachPlugins)
  .use(() => {});
createSlimI18n({ locale: "en" }).with(attachDevtools).t("count", { count: 1 });

// A hand-written installer is just a function; nothing is branded or
// registered, so a user's own composition step needs no core import.
const withRevision = createSlimI18n({ locale: "en" }).with((i18n) => ({
  i18n,
  dispose: subscribeToRevision(i18n, () => {}),
}));
withRevision.dispose();
withRevision.i18n.t("count", { count: 1 });

// FUTURE-PROOFING (fs-dx2 contract 2): the parameter is the widest honest
// shape — any `(host) => value`. A branded installer, which is how published
// plugin packages are expected to become directly `.with`-able, therefore
// already flows through unchanged and needs no overload today.
interface BrandedInstaller<A> {
  <T extends object>(host: T): T & A;
  readonly __comviInstaller: unique symbol;
}
declare const brandedFetchLoader: BrandedInstaller<{ readonly fetchLoaderConfigured: true }>;
const pipedBranded = createSlimI18n({ locale: "en" }).with(brandedFetchLoader);
pipedBranded.fetchLoaderConfigured satisfies true;
pipedBranded.t("count", { count: 1 });

// The root entry has every capability on the class already: composing there
// is a no-op that still type-checks, and root's import-map-accepting
// `registerLoader` overload survives the intersection.
const rootPiped = createI18n({ locale: "en" }).with(loader()).with(plugins());
rootPiped.registerLoader({ en: async () => ({ hello: "world" }) });
rootPiped.use(fetchLoaderShaped);

// ── wrong installer shapes ────────────────────────────────────────────────

// @ts-expect-error — the FACTORY is not an installer; it must be called
createSlimI18n({ locale: "en" }).with(loader);
// @ts-expect-error — an installer is a function, not a value
createSlimI18n({ locale: "en" }).with(attachLoader(createSlimI18n({ locale: "en" })));
// @ts-expect-error — a PLUGIN is not an installer: it demands a plugin host,
// which a bare slim instance is not (that is what `.with(plugins())` fixes)
createSlimI18n({ locale: "en" }).with(fetchLoaderShaped);
// @ts-expect-error — an import map's values must be import functions
createSlimI18n({ locale: "en" }).with(loader({ uk: "./uk.json" }));
// @ts-expect-error — devtools() takes DevtoolsOptions, not I18nOptions
createSlimI18n({ locale: "en" }).with(devtools({ locale: "en" }));
// @ts-expect-error — plugins() takes no configuration yet
createSlimI18n({ locale: "en" }).with(plugins({ strict: true }));
