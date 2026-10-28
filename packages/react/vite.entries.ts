/**
 * The entries of @comvi/react, shared by the production and development builds. Every
 * subpath in package.json `exports` is listed here and nowhere else.
 */
import { resolve } from "path";
import type { Plugin } from "vite";

export const entries = (dir: string): Record<string, string> => ({
  index: resolve(dir, "src/index.ts"),
  format: resolve(dir, "src/format.ts"),
});

/**
 * Deterministic entry names (`comvi-react.js`, `comvi-react-format.dev.js`), hashed chunks.
 * `<I18nHandover>` gets a chunk of its own, so an app that does not import it does not
 * import its React hooks either (a bundler keeps an external's unused named imports).
 */
export const output = (suffix: string) => ({
  format: "es" as const,
  advancedChunks: {
    groups: [
      { name: "binding", test: /[\\/]src[\\/]binding\.ts$/, priority: 2 },
      { name: "handover", test: /[\\/]src[\\/]handover\.ts$/, priority: 1 },
    ],
  },
  entryFileNames: (chunk: { name: string }) =>
    chunk.name === "index" ? `comvi-react${suffix}.js` : `comvi-react-${chunk.name}${suffix}.js`,
  chunkFileNames: `chunks/comvi-react-[name]-[hash]${suffix}.js`,
});

/** React, React DOM and every `@comvi/core` specifier stay external: one copy of each in an app. */
export const external = [/^react($|\/)/, /^react-dom($|\/)/, /^@comvi\/core($|\/)/];

/** "use client" on every chunk, for the Next.js App Router. */
export const useClient: Plugin = {
  name: "add-use-client",
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle))
      if (chunk.type === "chunk") chunk.code = `"use client";\n${chunk.code}`;
  },
};
