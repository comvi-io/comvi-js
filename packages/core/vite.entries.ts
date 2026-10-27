/**
 * The entries of @comvi/core, shared by the production and development builds.
 * Every subpath in package.json `exports` is listed here and nowhere else.
 */
import { resolve } from "path";

export const entries = (dir: string): Record<string, string> => ({
  index: resolve(dir, "src/index.ts"),
  cdn: resolve(dir, "src/cdn.ts"),
  plugins: resolve(dir, "src/plugins.ts"),
  format: resolve(dir, "src/format.ts"),
  devtools: resolve(dir, "src/devtools.ts"),
  internal: resolve(dir, "src/internal.ts"),
});

/** Deterministic entry names (`comvi-core.js`, `comvi-core-internal.dev.js`), hashed chunks. */
export const output = (suffix: string) => ({
  format: "es" as const,
  entryFileNames: (chunk: { name: string }) =>
    chunk.name === "index" ? `comvi-core${suffix}.js` : `comvi-core-${chunk.name}${suffix}.js`,
  chunkFileNames: `chunks/comvi-core-[name]-[hash]${suffix}.js`,
});
