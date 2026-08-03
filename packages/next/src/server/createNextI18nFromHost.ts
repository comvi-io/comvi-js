// The Next.js server factory that imports no core constructor of its own
// (framework-slim plan P5 step 1).
//
// `createNextI18n` builds a `NextComposedI18n` through Next's own non-exported
// composed-host builder (`createComposedNextI18n`), so it is permanently bound
// to `@comvi/core` plus the capability subpaths that composition needs. This
// companion takes the host as a FACTORY instead and preserves the caller's
// exact `NextServerHost`, so the only core modules in the graph are the ones
// the app itself composed — `@comvi/core` + `@comvi/core/loader` for the
// documented SSR recipe. Nothing here imports `createI18n` or any other core
// value, and it is exported ONLY from `@comvi/next/server`, never from the
// root or client entry.
import { resolveRouting } from "../nextI18nRouting";
import type { NextRoutingOptions } from "../nextI18nRouting";
import { getI18nInstance, registerServerI18nFactory } from "./cache";
import type { NextServerHost, ServerI18nHost } from "./hostTypes";
import type { DefaultTranslationParams } from "@comvi/core";
import type { RoutingConfig } from "../routing/types";

/**
 * Options for {@link createNextI18nFromHost} — routing ONLY.
 *
 * Locale, fallback, namespaces, translations, API key, tags/ICU, the loader
 * and plugins are owned by the host factory. They are neither silently
 * reapplied nor silently ignored here: they do not exist on this type at all.
 */
export type CreateNextI18nFromHostOptions = NextRoutingOptions;

/**
 * Result of {@link createNextI18nFromHost}.
 *
 * Exactly two fields. There are no `.use*` methods: plugin and loader
 * composition happen inside the host factory, at construction time. `C` is the
 * host type the caller supplied, preserved exactly — this deliberately does
 * NOT reuse `CreateNextI18nResult`, whose `i18n` is the composed
 * `NextComposedI18n<D>` and whose `.use*` methods call a plugin-host API a
 * plain `NextServerHost` does not have.
 */
export interface CreateNextI18nFromHostResult<
  D extends DefaultTranslationParams = {},
  C extends NextServerHost<D> = NextServerHost<D>,
> {
  /** The host instance — constructed on first access, then memoized. */
  readonly i18n: C;

  /** Routing configuration (use with middleware and navigation) */
  readonly routing: Required<RoutingConfig>;
}

/**
 * Create a Next.js i18n setup around a host you compose yourself.
 *
 * The host factory is registered, NOT called: `host()` runs at most once, on
 * whichever comes first — the first `result.i18n` access or the first server
 * helper that needs the instance (`getI18n()` / `loadTranslations()`). Both
 * paths resolve the same once-cell, so neither is a required initialization
 * order, and every later or concurrent access reuses the memoized instance.
 *
 * Configuring the server from two sources (this factory plus `setI18n`, or two
 * registrations) throws in development and production, naming both sources.
 *
 * @param host - Factory returning the composed host; the server always needs
 *   the loader capability, so the contract is `NextServerHost`
 * @param options - Routing configuration; everything else belongs to the host
 *
 * @example
 * ```typescript
 * // i18n/index.ts
 * import "server-only";
 * import { createI18n } from "@comvi/core";
 * import { attachLoader } from "@comvi/core/loader";
 * import { createNextI18nFromHost } from "@comvi/next/server";
 *
 * export const { i18n, routing } = createNextI18nFromHost(
 *   () => {
 *     const host = attachLoader(createI18n({ locale: "en", defaultNs: "default" }));
 *     host.registerLoader(myLoader);
 *     return host;
 *   },
 *   { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
 * );
 * ```
 */
export function createNextI18nFromHost<
  D extends DefaultTranslationParams = {},
  C extends NextServerHost<D> = NextServerHost<D>,
>(host: () => C, options: CreateNextI18nFromHostOptions): CreateNextI18nFromHostResult<D, C> {
  const routing = resolveRouting(options);
  registerServerI18nFactory(host as () => ServerI18nHost);

  return {
    get i18n(): C {
      return getI18nInstance() as C;
    },
    routing,
  };
}
