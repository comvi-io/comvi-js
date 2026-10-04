import { cache } from "react";
// Resolves to the app's config module under `withComvi`, to an empty stub
// without it. Kept external in the build so the APP's bundler applies the alias.
import * as configModule from "@comvi/next/config";
import type { RoutingConfig } from "../routing/types";
import type { NextServerHost, ServerI18nHost } from "./hostTypes";
import type { RequestStore } from "./types";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * What the aliased module may export. Read through a value, never as named
 * imports: the user module need not export `routing`, and a bundler warns on
 * a named import that does not exist.
 */
interface ConfigModule {
  readonly i18n?: ServerI18nHost;
  readonly routing?: Pick<RoutingConfig, "locales">;
}
const config: ConfigModule = configModule;

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
 * The server i18n once-cell. Two configuration sources feed it —
 * `setI18n(instance)` and `createNextI18nFromHost()`, which builds its host
 * EAGERLY, inside the call — and `resolveServerI18n()` reads it.
 *
 * Module-local, deliberately NEVER anchored on `globalThis`: a Next dev
 * recompile re-evaluates this module and gets a fresh `empty` cell. A surviving
 * cell that a re-run setup module conflicts with throws loudly (remedy: a full
 * dev-server restart) rather than silently resetting.
 */
type CellState =
  | { readonly kind: "empty" }
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
 * Build and register the host (the `createNextI18nFromHost` half).
 *
 * The conflict check comes FIRST, so a second configuration source never
 * builds a host it cannot register; a `build()` that throws propagates and
 * leaves the cell `empty`, exactly as if the call had never happened.
 * @internal
 */
export function registerServerI18nHost<C extends ServerI18nHost>(build: () => C): C {
  if (cell.kind !== "empty") {
    throw configurationConflict(cell, SOURCE_FACTORY);
  }
  const instance = build();
  cell = { kind: "resolved", instance, bySetI18n: false };
  return instance;
}

let warnedTwoSources = false;

/**
 * The server instance: the once-cell when a source filled it (the manual
 * path), otherwise the `i18n` export of the module `withComvi` aliased to
 * `@comvi/next/config`. Both read at call time, so an import cycle through the
 * config module is harmless.
 *
 * The cell and the alias holding the same object is the plugin plus an old
 * `setI18n(i18n)` from the same module, and is fine. Different objects is a
 * programming error: development warns once naming both, the cell wins.
 * @internal
 */
export function resolveServerI18n(): ServerI18nHost {
  const aliased = config.i18n;
  if (cell.kind === "resolved") {
    if (IS_DEV && aliased && aliased !== cell.instance && !warnedTwoSources) {
      warnedTwoSources = true;
      console.warn(
        `[comvi/next] Two i18n instances: one from ${
          cell.bySetI18n ? SOURCE_SET_I18N : SOURCE_FACTORY
        }, another from the withComvi({ config }) module. Using the first; keep one source.`,
      );
    }
    return cell.instance;
  }
  if (aliased) {
    return aliased;
  }
  throw new Error(
    "[comvi/next] i18n not configured. Add withComvi({ config }) to next.config, " +
      "or call setI18n(i18n) / createNextI18nFromHost(host, routing).",
  );
}

/**
 * The `routing` export of the aliased config module, if there is one.
 * @internal
 */
export function getConfiguredRouting(): ConfigModule["routing"] {
  return config.routing;
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
  warnedTwoSources = false;
}

/** @internal */
export function setRequestLocaleInternal(locale: string): void {
  getRequestStore().locale = locale;
}

/** @internal */
export function getRequestLocaleFromCache(): string | undefined {
  return getRequestStore().locale;
}

/** @internal The pairs whose load failed during this request. */
export function getRequestFailedLoads(): Set<string> {
  const store = getRequestStore();
  return (store.failedLoads ??= new Set());
}
