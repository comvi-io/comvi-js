/**
 * The framework-slim 0.5.0 migration table, as data.
 *
 * Source of truth: `.omc/plans/comvi-framework-slim.md` §3 (migration surface)
 * and §3.2 (the capability APIs). Every rule module below reads this table —
 * adding a member to a capability hook is a one-line change here.
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
 * The eight instance proxies `VueI18n` drops in 0.5.0 (plan §2.2 vue row, plus
 * `use` — removed in P6 so no member of the class is typed present yet throws
 * on a host without the capability, §2.4). Call sites move to `i18n.core.*`,
 * but the receiver's type is textually undecidable, so these are REPORTED,
 * never rewritten.
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

/** The hook whose destructures this codemod rewrites. */
export const SOURCE_HOOK = "useI18n";

// ---------------------------------------------------------------------------
// Single-entry convergence (`.omc/plans/comvi-single-entry.md` §7.2)
// ---------------------------------------------------------------------------

/**
 * The one host factory 0.5.0 publishes, and the class behind it —
 * `createI18n(options)` IS `new I18n(options)`, so both carry the constructor
 * options §7.2-4/5/6 move out.
 */
export const HOST_FACTORY = "createI18n";
export const HOST_CLASS = "I18n";

/** Its train-internal twin, renamed by §7.2-2 (it never published). */
export const SLIM_HOST_FACTORY = "createSlimI18n";

/** `@comvi/<pkg>/slim` -> `@comvi/<pkg>`: the retired host tier (§7.2-1). */
export const SLIM_SUBPATH = /^(@comvi\/[a-z0-9-]+)\/slim$/;

/**
 * §7.2-3: uppercase plugin factories that gained a lowercase `.with(…)`
 * installer in the same package. `.use(Factory(opts))` on a statically chained
 * host becomes `.with(installer(opts))` — same options, same position in the
 * chain, so evaluation order is preserved exactly.
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

/** The generic plugin-host installer every unknown `.use` needs first (§7.2-3). */
export const PLUGIN_HOST_INSTALLER = "plugins";

/**
 * Every installer that leaves the host with a plugin API. The lowercase plugin
 * installers ensure it themselves (§4), so a chain that composes one of them
 * already has `.use` and needs no `plugins()` added and no report.
 */
export const PLUGIN_HOST_PROVIDERS = [
  ...new Set([PLUGIN_HOST_INSTALLER, "attachPlugins", ...PLUGIN_INSTALLERS.values()]),
];

/** The ICU installer, and the compiler option inline catalogs take instead. */
export const ICU_INSTALLER = "icu";
export const ICU_COMPILER = "icuCompiler";

/** The flattener a non-flat inline catalog is wrapped with (§7.2-6). */
export const FLATTEN_CATALOG = "flattenCatalog";

/** The installer that now owns the two dropped constructor options (§7.2-5). */
export const DEVTOOLS_INSTALLER = "devtools";

/** Installers that compose discovery — `devtools()` and its low-level twin. */
export const DEVTOOLS_PROVIDERS = [DEVTOOLS_INSTALLER, "attachDevtools"];

/** Constructor options that became `devtools()` arguments (§2.2, §7.2-5). */
export const DEVTOOLS_OPTIONS = ["exposeGlobal", "instanceId"];

/**
 * Installers that compose a LOADER — the anchor for §7.3's safe remote-ICU
 * ordering: `icu()` must run before the host ingests anything, and a loader is
 * the only composed step that can ingest.
 */
export const LOADER_INSTALLERS = ["loader", "attachLoader", "fetchLoader"];

/**
 * Where a binding lives when the host itself came from `@comvi/core` (§2.4):
 * core keeps ONE capability per pure subpath, while every wrapper package
 * re-exports all of them from its single entry.
 */
export const CORE_SUBPATH_OF = new Map([
  [ICU_COMPILER, "@comvi/core/icu"],
  [ICU_INSTALLER, "@comvi/core/icu"],
  [PLUGIN_HOST_INSTALLER, "@comvi/core/plugins"],
  ["loader", "@comvi/core/loader"],
  ["attachLoader", "@comvi/core/loader"],
  ["attachPlugins", "@comvi/core/plugins"],
  ["attachDevtools", "@comvi/core/devtools"],
  [DEVTOOLS_INSTALLER, "@comvi/core/devtools"],
  [FLATTEN_CATALOG, "@comvi/core"],
]);
