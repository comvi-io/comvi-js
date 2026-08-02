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
 * The seven instance proxies `VueI18n` drops in 0.5.0 (plan §2.2 vue row).
 * Call sites move to `i18n.core.*`, but the receiver's type is textually
 * undecidable, so these are REPORTED, never rewritten.
 */
export const DROPPED_VUE_PROXIES = [
  "addActiveNamespace",
  "reloadTranslations",
  "registerLoader",
  "registerLocaleDetector",
  "registerPostProcessor",
  "onMissingKey",
  "onLoadError",
];

/** The hook whose destructures this codemod rewrites. */
export const SOURCE_HOOK = "useI18n";
