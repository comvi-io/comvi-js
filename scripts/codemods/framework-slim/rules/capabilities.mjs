/**
 * The 0.5.0 migration table, as data. Every rule module reads it — adding a
 * member to a capability hook is a one-line change here.
 */

/** Members that left `useI18n()` for `useI18nLoader()`. */
export const LOADER_MEMBERS = [
  "addActiveNamespace",
  "addActiveNamespaces",
  "reloadTranslations",
  "onLoadError",
];

/** Members that left `useI18n()` for `useI18nPlugins()`. */
export const PLUGIN_MEMBERS = ["onMissingKey"];

/** Capability hook names, in emission order. */
export const HOOKS = [
  { capability: "loader", hook: "useI18nLoader", members: LOADER_MEMBERS },
  { capability: "plugins", hook: "useI18nPlugins", members: PLUGIN_MEMBERS },
];

/** member name -> the hook that now owns it. */
export const MEMBER_TO_HOOK = new Map(
  HOOKS.flatMap(({ hook, members }) => members.map((member) => [member, hook])),
);

/** Every hook identifier this codemod may introduce. */
export const HOOK_NAMES = HOOKS.map(({ hook }) => hook);

/**
 * The eight instance proxies `VueI18n` drops in 0.5.0. Call sites move to
 * `i18n.core.*`, but the receiver's type is textually undecidable, so these are
 * REPORTED, never rewritten.
 *
 * `use` is on the list for the 0.4 proxy that forwarded a RAW PLUGIN to the
 * core queue, which decision E did not bring back: the wrapper's own `use` is
 * now the installer pipe (`.use(installer)`), and a raw plugin has to reach the
 * core's plugin host. So its target member is not the same name — see
 * `VUE_PROXY_TARGET`.
 */
export const DROPPED_VUE_PROXIES = [
  "addActiveNamespace",
  "reloadTranslations",
  "registerLoader",
  "registerLocaleDetector",
  "registerPostProcessor",
  "onMissingKey",
  "onLoadError",
  "use",
];

/**
 * The member a dropped proxy became on `i18n.core`, where that is NOT the same
 * name. Only `use` moved: the raw plugin queue was renamed `registerPlugin` to
 * sit beside `registerLoader` / `registerLocaleDetector`, freeing `use` for the
 * one composition verb.
 */
export const VUE_PROXY_TARGET = new Map([["use", "registerPlugin"]]);

/** The hook whose destructures this codemod rewrites. */
export const SOURCE_HOOK = "useI18n";

// ---------------------------------------------------------------------------
// Single-entry convergence
// ---------------------------------------------------------------------------

/**
 * The one host factory 0.5.0 publishes, and the class behind it —
 * `createI18n(options)` IS `new I18n(options)`, so both carry the constructor
 * options the rules below move out.
 */
export const HOST_FACTORY = "createI18n";
export const HOST_CLASS = "I18n";

/** Its internal twin, renamed because it never published. */
export const SLIM_HOST_FACTORY = "createSlimI18n";

/** `@comvi/<pkg>/slim` -> `@comvi/<pkg>`: the retired host tier. */
export const SLIM_SUBPATH = /^(@comvi\/[a-z0-9-]+)\/slim$/;

/**
 * Uppercase plugin factories that gained a lowercase installer in the same
 * package. `.use(Factory(opts))` on a statically chained host becomes
 * `.use(installer(opts))` — only the CALLEE changes, so the options, the
 * position in the chain and therefore the evaluation order are preserved
 * exactly. The verb does not change: after decision E `.use` is the one
 * composition verb, and an installer is exactly what belongs in it.
 */
export const PLUGIN_INSTALLERS = new Map([
  ["FetchLoader", "fetchLoader"],
  ["LocaleDetector", "localeDetector"],
  ["InContextEditor", "inContextEditor"],
  ["InContextEditorPlugin", "inContextEditor"],
]);

/** Owning package for each first-party plugin factory. */
export const PLUGIN_FACTORY_MODULES = new Map([
  ["FetchLoader", "@comvi/plugin-fetch-loader"],
  ["LocaleDetector", "@comvi/plugin-locale-detector"],
  ["InContextEditor", "@comvi/plugin-in-context-editor"],
  ["InContextEditorPlugin", "@comvi/plugin-in-context-editor"],
]);

/** The generic plugin-host installer: the capability, with nothing queued. */
export const PLUGIN_HOST_INSTALLER = "plugins";

/**
 * The installer that carries ONE raw plugin: `definePlugin(fn, options?)`
 * attaches the plugin capability and queues `fn` on it. It is how an app
 * registers its own plugin through the one verb — `.use(definePlugin(fn))` —
 * and it is what a pre-E `.use(rawPlugin)` step becomes.
 *
 * NOT `plugin`: one character from `plugins()` above, the opposite job, and
 * both sit in the same chain.
 */
export const PLUGIN_HELPER = "definePlugin";

/**
 * Every installer that leaves the host with a plugin API. The lowercase plugin
 * installers and `definePlugin(fn)` ensure it themselves, so a chain that composes
 * one of them already has `registerPlugin` and needs no `plugins()` and no
 * report.
 */
export const PLUGIN_HOST_PROVIDERS = [
  ...new Set([
    PLUGIN_HOST_INSTALLER,
    PLUGIN_HELPER,
    "attachPlugins",
    ...PLUGIN_INSTALLERS.values(),
  ]),
];

/**
 * The compiler an ICU catalog takes, in the constructor options.
 *
 * There is no installer beside it. ICU is a compiler setting, not a capability
 * with an API, so `compiler: icuCompiler` is the one enable form and it works
 * whatever the catalog's source — inline, loader, CDN or API.
 */
export const ICU_COMPILER = "icuCompiler";

/**
 * The pure flattener. It is NOT a capability and it wraps NOTHING: the base
 * host flattens `{ nav: { home } }` itself, at the one seam a catalog enters,
 * on every host and whether or not anything is composed onto it. So a nested
 * inline catalog needs no migration at all.
 *
 * What did change is WHERE it is published. 0.5.0 keeps it on the `@comvi/core`
 * root only — the entries below stopped re-exporting it when the base took over
 * flattening — so the one thing a 0.4 tree needs is the import retargeted.
 */
export const FLATTEN_CATALOG = "flattenCatalog";

/**
 * Entries that re-exported `flattenCatalog` in 0.4 and no longer publish it.
 * `@comvi/next` (the root) is deliberately absent: it never re-exported it.
 */
export const FLATTEN_CATALOG_MOVED_FROM = [
  "@comvi/core/loader",
  "@comvi/react",
  "@comvi/solid",
  "@comvi/svelte",
  "@comvi/vue",
  "@comvi/next/client",
  "@comvi/next/server",
];

// ---------------------------------------------------------------------------
// The `createNextI18n(…)` result (decision D7 for Next)
// ---------------------------------------------------------------------------

/** The composed-root factory `@comvi/next` publishes, and its specifier. */
export const NEXT_ROOT = "@comvi/next";
export const NEXT_RESULT_FACTORY = "createNextI18n";

/**
 * The two Next-scoped plugin installers `result.use(…)` takes after N1:
 * `nextPlugin(plugin, { runtime, environment, …pluginOptions })` and its
 * lazily imported twin. What used to be `result.use(plugin, options)` — the
 * scoped raw-plugin queue — and its four runtime-fixed delegates.
 */
export const NEXT_PLUGIN_INSTALLER = "nextPlugin";
export const NEXT_PLUGIN_LAZY_INSTALLER = "nextPluginLazy";

/** The installer that now owns the two dropped constructor options. */
export const DEVTOOLS_INSTALLER = "devtools";

/** Installers that compose discovery — `devtools()` and its low-level twin. */
export const DEVTOOLS_PROVIDERS = [DEVTOOLS_INSTALLER, "attachDevtools"];

/** Constructor options that became `devtools()` arguments. */
export const DEVTOOLS_OPTIONS = ["exposeGlobal", "instanceId"];

/**
 * Installers that compose a LOADER. A loader is the only composed step that
 * fetches a catalog the codemod cannot read, which is what makes it the anchor
 * for the `runtime-icu-unproven` advisory.
 */
export const LOADER_INSTALLERS = ["loader", "attachLoader", "fetchLoader"];

/**
 * Where a binding lives when the host itself came from `@comvi/core`:
 * core keeps ONE capability per pure subpath, while every wrapper package
 * re-exports all of them from its single entry.
 *
 * `flattenCatalog` is the one entry that is not a capability: it is on the
 * ROOT, and the root is also where a 0.4 import of it is retargeted to.
 */
export const CORE_SUBPATH_OF = new Map([
  [ICU_COMPILER, "@comvi/core/icu"],
  [PLUGIN_HOST_INSTALLER, "@comvi/core/plugins"],
  [PLUGIN_HELPER, "@comvi/core/plugins"],
  ["loader", "@comvi/core/loader"],
  ["attachLoader", "@comvi/core/loader"],
  ["attachPlugins", "@comvi/core/plugins"],
  ["attachDevtools", "@comvi/core/devtools"],
  [DEVTOOLS_INSTALLER, "@comvi/core/devtools"],
  [FLATTEN_CATALOG, "@comvi/core"],
]);
