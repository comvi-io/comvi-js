/**
 * The entries of @comvi/vue, shared by the production and development builds. Every subpath
 * in package.json `exports` is listed here and nowhere else.
 */
import { resolve } from "path";

export const entries = (dir: string): Record<string, string> => ({
  index: resolve(dir, "src/index.ts"),
  format: resolve(dir, "src/format.ts"),
});

/**
 * Deterministic entry names (`comvi-vue.js`, `comvi-vue-format.dev.js`), hashed chunks. The
 * binding is one chunk that `.` and `./format` share: one injection key, one state cell
 * per instance. `<T>` gets a chunk of its own, so an app that does not import it does not
 * import its Vue functions either (a bundler keeps an external's unused named imports).
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
    chunk.name === "index" ? `comvi-vue${suffix}.js` : `comvi-vue-${chunk.name}${suffix}.js`,
  chunkFileNames: `chunks/comvi-vue-[name]-[hash]${suffix}.js`,
});

/** Vue and every `@comvi/core` specifier stay external: one copy of each in an app. */
export const external = [/^vue($|\/)/, /^@comvi\/core($|\/)/];
