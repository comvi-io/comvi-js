// Unlike `createNextI18n` — permanently bound to `@comvi/core` plus the
// capability subpaths its composed-instance builder needs — this companion takes
// the instance as a FACTORY, so the only core modules in the graph are the ones the
// app itself composed. Nothing here imports `createI18n` or any other core
// value, and it is exported ONLY from `@comvi/next/server`, never from the root
// or client entry.
import { resolveRouting } from "../nextI18nRouting";
import type { NextRoutingOptions } from "../nextI18nRouting";
import { registerServerI18nInstance } from "./cache";
import type { NextServerInstance, ServerI18nInstance } from "./instanceTypes";
import type { DefaultTranslationParams } from "@comvi/core";
import type { RoutingConfig } from "../routing/types";

/**
 * Options for {@link createNextI18nFromInstance} — routing ONLY.
 *
 * Locale, fallback, namespaces, translations, API key, tags/ICU, the loader
 * and plugins are owned by the `factory()` factory. They are neither silently
 * reapplied nor silently ignored here: they do not exist on this type at all.
 */
export type CreateNextI18nFromInstanceOptions = NextRoutingOptions;

/**
 * Result of {@link createNextI18nFromInstance}.
 *
 * No `.use` method: composition happens inside the `factory()` factory, at
 * construction time. `C` is the caller's instance type, preserved exactly —
 * deliberately not `CreateNextI18nResult`, whose `.use` pipe is written for
 * the composed root.
 */
export interface CreateNextI18nFromInstanceResult<
  D extends DefaultTranslationParams = {},
  C extends NextServerInstance<D> = NextServerInstance<D>,
> {
  /** The instance `factory()` returned, built inside `createNextI18nFromInstance`. */
  readonly i18n: C;

  /** Routing configuration (use with middleware and navigation) */
  readonly routing: Required<RoutingConfig>;
}

/**
 * Create a Next.js i18n setup around an instance you compose yourself.
 *
 * Construction is EAGER: `factory()` runs exactly once, inside this call, and the
 * instance it returns is both `result.i18n` and what every server helper
 * (`getI18n()` / `loadMessages()`) resolves. The documented shape is a
 * module-scope `export const { i18n, routing } = createNextI18nFromInstance(…)`,
 * which is exactly when a module-scope instance should be built — the same moment
 * `createNextI18n` builds its own. A factory that throws leaves nothing
 * configured, so the module that failed to load can be fixed and re-run.
 *
 * Configuring the server from two sources (this factory plus `setI18n`, or two
 * calls) throws in development and production, naming both sources — checked
 * BEFORE `factory()` runs, so a conflicting registration builds nothing.
 *
 * @param factory - Factory returning the composed instance; the server always needs
 *   the loader capability, so the contract is `NextServerInstance`
 * @param options - Routing configuration; everything else belongs to the instance
 *
 * @example
 * ```typescript
 * // i18n/index.ts
 * import { createI18n } from "@comvi/core";
 * import { attachLoader } from "@comvi/core/loader";
 * import { createNextI18nFromInstance } from "@comvi/next/server";
 *
 * export const { i18n, routing } = createNextI18nFromInstance(
 *   () => {
 *     const instance = attachLoader(createI18n({ locale: "en", defaultNs: "default" }));
 *     instance.registerLoader(myLoader);
 *     return instance;
 *   },
 *   { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
 * );
 * ```
 */
export function createNextI18nFromInstance<
  D extends DefaultTranslationParams = {},
  C extends NextServerInstance<D> = NextServerInstance<D>,
>(
  factory: () => C,
  options: CreateNextI18nFromInstanceOptions,
): CreateNextI18nFromInstanceResult<D, C> {
  const routing = resolveRouting(options);
  const i18n = registerServerI18nInstance(factory as () => ServerI18nInstance, routing) as C;

  return { i18n, routing };
}
