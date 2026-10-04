import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/** Every published package that writes a runtime message. */
export type ComviPackage =
  | "@comvi/core"
  | "@comvi/react"
  | "@comvi/vue"
  | "@comvi/solid"
  | "@comvi/svelte"
  | "@comvi/next"
  | "@comvi/nuxt"
  | "@comvi/plugin-fetch-loader"
  | "@comvi/plugin-locale-detector"
  | "@comvi/plugin-in-context-editor"
  | "@comvi/vite-plugin"
  | "@comvi/cli";

/**
 * The prefix rule: every runtime message opens with the name of the package
 * whose code throws or logs it. A core message surfaced through a binding keeps
 * `[@comvi/core]`; a sentence two packages share keeps its words and changes
 * only the prefix.
 */
export const errorPrefix = (packageName: ComviPackage) => `[${packageName}]`;

/**
 * A message prefix is a bracketed token opening a string literal and followed
 * by a space (`"[locale]"`, a route segment, is not one). `@comvi/core` cannot
 * import this package (it depends on core), so its own test spells the same
 * pattern out.
 */
export const MESSAGE_PREFIX = /["'`](\[[^\]\s"'`]+\]) /g;

/** `[i18n]` opening a string literal, with or without a following space. */
export const ANONYMOUS_PREFIX = /["'`]\[i18n\]/;

/**
 * A package name opening a string literal WITHOUT the brackets, as a message
 * (`"@comvi/core: …"`, `"@comvi/core …"`). An import specifier is followed by
 * its closing quote or a `/`, so it never matches.
 */
export const UNBRACKETED_PREFIX = /["'`]@comvi\/[a-z-]+[: ]/;

/** Every source file under `dir` (`.ts`, `.tsx`, `.vue`, `.svelte`), concatenated. */
export function readSources(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return readSources(path);
      return /\.(ts|tsx|vue|svelte)$/.test(entry.name) ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}

/** The distinct message prefixes in `source`, sorted. */
export const messagePrefixes = (source: string): string[] =>
  [...new Set([...source.matchAll(MESSAGE_PREFIX)].map((match) => match[1]))].sort();
