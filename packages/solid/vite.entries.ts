/**
 * The entries of @comvi/solid, shared by the production and development builds. Every subpath
 * in package.json `exports` is listed here and nowhere else.
 */
import { resolve } from "path";

export const entries = (dir: string): Record<string, string> => ({
  index: resolve(dir, "src/index.ts"),
  format: resolve(dir, "src/format.ts"),
});

/**
 * Deterministic entry names (`comvi-solid.js`, `comvi-solid-format.dev.js`), hashed chunks. The
 * binding is one chunk that `.` and `./format` share: one context. `<T>` gets a chunk of its
 * own, so an app that does not import it does not import it.
 */
export const output = (suffix: string) => ({
  format: "es" as const,
  advancedChunks: {
    groups: [
      { name: "binding", test: /[\\/]src[\\/]binding\.ts$/, priority: 2 },
      { name: "T", test: /[\\/]src[\\/]T\.ts$/, priority: 1 },
    ],
  },
  entryFileNames: (chunk: { name: string }) =>
    chunk.name === "index" ? `comvi-solid${suffix}.js` : `comvi-solid-${chunk.name}${suffix}.js`,
  chunkFileNames: `chunks/comvi-solid-[name]-[hash]${suffix}.js`,
});

/** Solid and every `@comvi/core` specifier stay external: one copy of each in an app. */
export const external = [/^solid-js($|\/)/, /^@comvi\/core($|\/)/];
