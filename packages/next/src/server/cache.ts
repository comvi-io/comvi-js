import { cache } from "react";
import type { I18n } from "@comvi/core";
import type { ServerI18nHost } from "./hostTypes";
import type { RequestStore } from "./types";

/**
 * Request-scoped locale storage using React cache()
 * This allows setRequestLocale() to store locale that getTranslations() can read
 *
 * React's cache() creates a per-request memoized value in Server Components,
 * allowing us to share state across the component tree without prop drilling.
 */
const getRequestStore = cache(
  (): RequestStore => ({
    locale: undefined,
  }),
);

/**
 * The server i18n once-cell.
 *
 * Two configuration sources feed it — `setI18n(instance)` (a ready instance)
 * and `createNextI18nFromHost()` (a host FACTORY that must not run until
 * something needs the instance) — and two trigger paths resolve it: the
 * factory result's `i18n` getter and `getI18nInstance()` (reached from
 * `getI18n()` / `loadTranslations()`). Neither path is required to run first.
 *
 * Durable states are `empty | factory | resolved`; `resolving` is the one
 * transient micro-state, held only for the duration of the synchronous
 * factory call so that re-entrancy is a loud cycle error rather than a second
 * `host()` invocation. Resolution is synchronous by construction (the factory
 * is `() => C`, no await exists inside it), so concurrent server renders —
 * which can only interleave at await points — observe `factory` → `resolved`
 * as atomic.
 *
 * The cell is a module-local binding and is deliberately NEVER anchored on
 * `globalThis`: a Next dev recompile re-evaluates this module and gets a fresh
 * `empty` cell. Nothing resets it in dev; a surviving cell that a re-run setup
 * module conflicts with throws loudly, which is the correct signal (remedy: a
 * full dev-server restart), not a silent dev-only reset.
 */
type HostFactory = () => ServerI18nHost;

type CellState =
  | { readonly kind: "empty" }
  | { readonly kind: "factory"; readonly factory: HostFactory }
  | { readonly kind: "resolving"; readonly factory: HostFactory }
  | { readonly kind: "resolved"; readonly instance: ServerI18nHost; readonly bySetI18n: boolean };

const SOURCE_FACTORY = "createNextI18nFromHost()";
const SOURCE_SET_I18N = "setI18n()";

const EMPTY: CellState = { kind: "empty" };

let cell: CellState = EMPTY;

/**
 * Two configuration sources is a programming error, not a last-write-wins
 * merge. Thrown in development AND production, naming both sources.
 *
 * Deliberately terse — it ships in every consumer's server bundle, and §2.4's
 * production-message convention is "name the subject and the fix, drop the
 * prose". Which source configured the cell is derived, not stored as a label,
 * so an app that never calls `setI18n` drops both names with this function.
 */
const configurationConflict = (configured: CellState, incoming: string): Error =>
  new Error(
    `[comvi/next] i18n already configured by ${
      configured.kind === "resolved" && configured.bySetI18n ? SOURCE_SET_I18N : SOURCE_FACTORY
    }; ${incoming} is a second source. Configure it once — only a same-instance setI18n() repeats.`,
  );

/**
 * Configure the global i18n instance for server-side usage
 *
 * Call this once in your i18n configuration file to make getTranslations() work.
 *
 * Calling it again with the SAME instance is a no-op (setup files commonly run
 * more than once). Any other second configuration — a different instance, or a
 * `createNextI18nFromHost()` registration — throws.
 *
 * @param i18n - The i18n instance created with createI18n
 *
 * @example
 * ```typescript
 * // i18n/index.ts
 * import { createI18n } from '@comvi/next';
 * import { setI18n } from '@comvi/next/server';
 * import { translations } from './translations';
 *
 * export const i18n = createI18n({
 *   locale: 'en',
 *   defaultNs: 'default',
 *   translation: translations,
 * });
 *
 * // Configure for server-side usage
 * setI18n(i18n);
 * ```
 */
export function setI18n(i18n: I18n): void {
  const instance = i18n as ServerI18nHost;
  if (cell.kind === "empty") {
    cell = { kind: "resolved", instance, bySetI18n: true };
    return;
  }
  if (cell.kind === "resolved" && cell.instance === instance) {
    return;
  }
  throw configurationConflict(cell, SOURCE_SET_I18N);
}

/**
 * Register a host FACTORY without invoking it (the lazy half of
 * `createNextI18nFromHost`).
 * @internal
 */
export function registerServerI18nFactory(factory: HostFactory): void {
  if (cell.kind !== "empty") {
    throw configurationConflict(cell, SOURCE_FACTORY);
  }
  cell = { kind: "factory", factory };
}

/**
 * Resolve the once-cell: run the registered factory at most once, memoize
 * synchronously, and hand every later access the same instance.
 *
 * A factory that throws propagates its error and restores the `factory` state,
 * so the next access retries — an arbitrary `() => C` cannot be assumed
 * deterministic, and a stuck half-initialized cell would be worse than a
 * retry. The exactly-once guarantee is therefore about SUCCESSFUL resolution.
 *
 * @internal
 */
export function getI18nInstance(): ServerI18nHost {
  if (cell.kind === "resolved") {
    return cell.instance;
  }
  if (cell.kind === "factory") {
    const { factory } = cell;
    cell = { kind: "resolving", factory };
    let instance: ServerI18nHost;
    try {
      instance = factory();
    } catch (error) {
      cell = { kind: "factory", factory };
      throw error;
    }
    cell = { kind: "resolved", instance, bySetI18n: false };
    return instance;
  }
  if (cell.kind === "resolving") {
    throw new Error(
      "[comvi/next] i18n host factory cycle: the factory read the instance it is building.",
    );
  }
  throw new Error(
    "[comvi/next] i18n not configured. Call setI18n(i18n) or createNextI18nFromHost(host, routing).",
  );
}

/**
 * Reset the once-cell to `empty`.
 *
 * SUITE-ONLY (and custom harnesses). Nothing invokes this in development:
 * dev-reload freshness comes from module-scope re-evaluation. Deliberately not
 * re-exported by `@comvi/next/server`.
 *
 * @internal
 */
export function _resetServerI18n(): void {
  cell = EMPTY;
}

/**
 * Set the request locale in the cache
 * @internal
 */
export function setRequestLocaleInternal(locale: string): void {
  getRequestStore().locale = locale;
}

/**
 * Get the request locale from cache
 * @internal
 */
export function getRequestLocaleFromCache(): string | undefined {
  return getRequestStore().locale;
}
