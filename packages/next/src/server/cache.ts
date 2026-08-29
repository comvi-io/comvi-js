import { cache } from "react";
import type { NextServerHost, ServerI18nHost } from "./hostTypes";
import type { RequestStore } from "./types";

/**
 * React's cache() creates a per-request memoized value in Server Components, so
 * the locale is shared across the component tree without prop drilling.
 */
const getRequestStore = cache(
  (): RequestStore => ({
    locale: undefined,
  }),
);

/**
 * The server i18n once-cell. Two configuration sources feed it
 * (`setI18n(instance)` and `createNextI18nFromHost()`, a factory that must not
 * run until something needs the instance) and two paths resolve it (the factory
 * result's `i18n` getter and `getI18nInstance()`); neither path is required to
 * run first.
 *
 * `resolving` is a transient micro-state held only for the duration of the
 * synchronous factory call, so re-entrancy is a loud cycle error rather than a
 * second `host()` invocation. Resolution is synchronous by construction (the
 * factory is `() => C`), so concurrent server renders — which can only
 * interleave at await points — observe `factory` → `resolved` as atomic.
 *
 * Module-local, deliberately NEVER anchored on `globalThis`: a Next dev
 * recompile re-evaluates this module and gets a fresh `empty` cell. A surviving
 * cell that a re-run setup module conflicts with throws loudly (remedy: a full
 * dev-server restart) rather than silently resetting.
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
 * Which source configured the cell is derived, not stored as a label, so an app
 * that never calls `setI18n` drops both names along with this function.
 */
const configurationConflict = (configured: CellState, incoming: string): Error =>
  new Error(
    `[comvi/next] i18n already configured by ${
      configured.kind === "resolved" && configured.bySetI18n ? SOURCE_SET_I18N : SOURCE_FACTORY
    }; ${incoming} is a second source. Configure it once — only a same-instance setI18n() repeats.`,
  );

/**
 * Configure the global i18n instance for server-side usage.
 *
 * Calling it again with the SAME instance is a no-op (setup files commonly run
 * more than once). Any other second configuration — a different instance, or a
 * `createNextI18nFromHost()` registration — throws.
 *
 * @param i18n - A loader-carrying host: the `i18n` from `createNextI18n`, or
 * any host you composed yourself. The server pipeline calls `getLoader` /
 * `reloadTranslations` on it, so the loader capability is part of the
 * contract — a bare `@comvi/core` host is rejected at the type level rather
 * than failing inside `loadTranslations`.
 *
 * @example
 * ```typescript
 * // i18n/index.ts
 * import { createNextI18n } from '@comvi/next';
 * import { setI18n } from '@comvi/next/server';
 * import { translations } from './translations';
 *
 * export const { i18n, routing } = createNextI18n({
 *   defaultLocale: 'en',
 *   locales: ['en'],
 *   defaultNs: 'default',
 *   translation: translations,
 * });
 *
 * // Configure for server-side usage
 * setI18n(i18n);
 * ```
 */
export function setI18n(i18n: NextServerHost): void {
  // The pipeline only ever touches the `ServerI18nHost` subset; narrowing here
  // keeps the internal type out of the published signature.
  const instance: ServerI18nHost = i18n;
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

/** @internal */
export function setRequestLocaleInternal(locale: string): void {
  getRequestStore().locale = locale;
}

/** @internal */
export function getRequestLocaleFromCache(): string | undefined {
  return getRequestStore().locale;
}
