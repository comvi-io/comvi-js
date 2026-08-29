// Capability presence: the shared, loud boundary between a wrapper and the
// host instance it was handed (framework-slim §2.4).
//
// A bare `@comvi/core` instance is a `WrapperI18nHost` and nothing more:
// the loader and plugin-host APIs are absent from its module graph, not
// merely disabled. Wrappers therefore verify capability presence ONCE, at the
// acquisition call (`useI18nLoader()` / `useI18nPlugins()`), and throw the
// error this module builds — in dev AND in prod. There is no silent no-op and
// no dev-only tombstone.
//
// `core/plugins.ts` is the other consumer: on a plugins-only host it installs
// one {@link capabilityShim} per {@link LOADER_MEMBERS} entry, so a PLUGIN
// handed that host gets the same error a wrapper would (B4) rather than a bare
// `TypeError`. That is also why the probes below have to know about shims —
// a stand-in is an absence, and reporting it as presence would flip the very
// guards it exists to serve.
//
// The checks are STRUCTURAL and read PUBLIC names only. `_`-prefixed
// internals are renamed by the shared terser nameCache
// (`vite.shared.ts#mangleInternalProps`), so probing them from a wrapper
// bundle would break silently in prod; public method names are never
// mangled, which makes these guards mangling-immune by construction.
//
// This module is pure: nothing here runs at import time, so a wrapper that
// imports only `subscribeToRevision` from the root pays zero bytes for it.
import type {
  DefaultTranslationParams,
  I18nLoaderApi,
  I18nPluginHostApi,
  WrapperI18nHost,
} from "../types";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/** The capability subpaths a host can be composed with. */
export type CapabilityName = "loader" | "plugins";

/**
 * Every public member of `I18nLoaderApi`. Attach is all-or-nothing, so a host
 * that carries all of them carries the whole bag.
 *
 * ONE list, TWO readers: `hasLoaderApi` probes it and `attachPlugins` installs
 * one {@link capabilityShim} per entry. A hand-written second list in either
 * place would drift out of sync with the interface the moment a member is
 * added. Both directions are gated at compile time by
 * `tests/types/capability-members.test-d.ts`: the `satisfies` below rejects a
 * name that is not a member, and the assignment there rejects a member that is
 * missing here.
 *
 * @internal
 */
export const LOADER_MEMBERS = [
  "registerLoader",
  "getLoader",
  "reloadTranslations",
  "addActiveNamespace",
  "addActiveNamespaces",
  "onLoadError",
] as const satisfies readonly (keyof I18nLoaderApi)[];

/**
 * Every public member of `I18nPluginHostApi`.
 *
 * Probe-only, unlike {@link LOADER_MEMBERS}: nothing stands in for a missing
 * plugin host, because a host without the capability has no `use()` to hand a
 * plugin the instance in the first place.
 *
 * @internal
 */
export const PLUGIN_MEMBERS = [
  "use",
  "registerLocaleDetector",
  "getLanguageDetector",
  "onMissingKey",
  "registerPostProcessor",
  "setPluginData",
  "getPluginData",
] as const satisfies readonly (keyof I18nPluginHostApi)[];

/**
 * The error every wrapper throws when a capability was requested from a host
 * that does not have it. One factory, one wording, four wrappers.
 *
 * @example
 * ```ts
 * if (!hasLoaderApi(host)) throw missingCapability("loader");
 * ```
 */
export function missingCapability(name: CapabilityName): Error {
  return new Error(
    IS_DEV
      ? `[comvi] This i18n instance has no ${name} capability. Compose it: .with(${name}()) from "@comvi/core/${name}", or the lower-level attach${
          name === "loader" ? "Loader" : "Plugins"
        }.`
      : `[comvi] missing ${name} capability — attach @comvi/core/${name}`,
  );
}

/**
 * A callable stand-in for one member of a capability the host does not have.
 * DEV-ONLY — `attachPlugins` installs these behind its own `IS_DEV` fold, so
 * nothing here survives into a production build.
 *
 * The `comviShim` brand is what keeps the stand-ins honest: they ARE
 * functions, so an unbranded probe would report the capability as PRESENT on a
 * host that cannot load anything — flipping `useI18nLoader()` from a loud
 * throw to a bag of throwing methods, and `@comvi/nuxt`'s server-side
 * `hasLoaderApi` feature detect from "skip, there is nothing to load" to a
 * per-namespace failure. Rejecting the brand is what makes the two builds
 * AGREE: prod has no shims to reject, dev rejects the ones it installs, and
 * both answer `false` for a plugins-only host.
 *
 * The brand is a PUBLIC property name (never `_`-prefixed) because it is read
 * across the core/wrapper bundle boundary, where the shared terser nameCache
 * does not reach.
 *
 * @internal
 */
export interface CapabilityShim {
  (): never;
  /** Marks this function as an absence, not an implementation. */
  comviShim?: true;
}

/** @internal Build one branded, throwing stand-in for `name`'s API. Dev-only. */
export function capabilityShim(name: CapabilityName): CapabilityShim {
  const shim: CapabilityShim = () => {
    throw missingCapability(name);
  };
  shim.comviShim = true;
  return shim;
}

/**
 * Whether one probed member is a real implementation.
 *
 * The whole predicate is selected at module scope, not per call: `IS_DEV` is a
 * build-time literal, so production keeps only the right-hand arm and the
 * probes below stay the plain `typeof … === "function"` test they were before
 * the shims existed. Writing it as `… && (!IS_DEV || brand)` inside the
 * predicate does NOT fold — terser leaves a dangling `&& !0` behind — which is
 * exactly the kind of dev-only residue the production bundle should not carry.
 */
const isRealMember: (member: unknown) => boolean = IS_DEV
  ? (member) => typeof member === "function" && (member as CapabilityShim).comviShim !== true
  : (member) => typeof member === "function";

/** Whether `host` carries the whole `@comvi/core/loader` surface. */
export function hasLoaderApi<D extends DefaultTranslationParams = {}>(
  host: WrapperI18nHost<D>,
): host is WrapperI18nHost<D> & I18nLoaderApi {
  const probe = host as unknown as Record<string, unknown>;
  return LOADER_MEMBERS.every((name) => isRealMember(probe[name]));
}

/** Whether `host` carries the whole `@comvi/core/plugins` surface. */
export function hasPluginHostApi<D extends DefaultTranslationParams = {}>(
  host: WrapperI18nHost<D>,
): host is WrapperI18nHost<D> & I18nPluginHostApi {
  const probe = host as unknown as Record<string, unknown>;
  return PLUGIN_MEMBERS.every((name) => isRealMember(probe[name]));
}
