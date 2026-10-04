/**
 * The error-message stems both framework packages share, spelled identically
 * after each package's own prefix (`[@comvi/next]`, `[@comvi/nuxt]`). Docs pages
 * quote these, so a reworded stem in one package is a docs bug in the other.
 *
 * Each package asserts that its OWN sources contain `${prefix} ${stem}` for
 * every row — `packages/next/tests/error-stems.test.ts` and
 * `packages/nuxt/tests/error-stems.test.ts`. See `docs/design/next-nuxt-parity.md`.
 */
export const SHARED_ERROR_STEMS = [
  "i18n not configured.",
  "No loader registered, so SSR loaded nothing.",
  "Failed to load ${",
] as const;

/** The prefix rule: the package name, as every other comvi package writes it. */
export const errorPrefix = (packageName: "@comvi/next" | "@comvi/nuxt") => `[${packageName}]`;
