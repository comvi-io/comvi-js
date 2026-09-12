/**
 * Shared pieces of the @comvi/react build (prod / dev), mirroring
 * `packages/core/vite.shared.ts`.
 *
 * TWO artifacts ship from one source tree:
 * - `dist/comvi-react.js`     — `__DEV__: false`, what `default` resolves to;
 * - `dist/comvi-react.dev.js` — `__DEV__: true`, what a bundler picks under
 *   the `"development"` export condition (`vite.config.dev.ts`).
 *
 * WHY: `vite build` pins `NODE_ENV=production`, so a package with a single
 * artifact bakes `__DEV__: false` into the only file consumers can resolve —
 * every `IS_DEV`-guarded diagnostic in `src/` is then dead code in the
 * published package, no matter what mode the consuming app builds in. The
 * `.dev` artifact is the only thing that makes those warnings reachable, and
 * it is reachable ONLY because package.json answers the `development`
 * condition with it.
 */
import { resolve } from "path";
import type { Plugin } from "vite";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

/** "use client" for Next.js App Router compatibility. Both artifacts need it. */
export const addUseClient: Plugin = {
  name: "add-use-client",
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === "chunk") {
        chunk.code = `"use client";\n${chunk.code}`;
      }
    }
  },
};

/** Build options for one artifact; `suffix` is "" (prod) or ".dev". */
export const reactBuild = (dir: string, suffix: "" | ".dev") => ({
  ...createLibraryBuildOptions({
    entry: resolve(dir, "src/index.ts"),
    name: "ComviReact",
    fileNames: { es: `comvi-react${suffix}.js`, cjs: `comvi-react${suffix}.cjs` },
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      ...COMVI_CORE_EXTERNALS,
      "use-sync-external-store",
      "use-sync-external-store/shim",
    ],
    globals: {
      react: "React",
      "react-dom": "ReactDOM",
      "react/jsx-runtime": "jsxRuntime",
      "@comvi/core": "ComviCore",
    },
    chunkFileNames: `chunks/comvi-react-[name]${suffix}.js`,
    // `<T>` — and with it this package's only `@comvi/core/rich-text` import —
    // is pinned into its own chunk, so an app that never renders `<T>` drops
    // the whole module. Sharing a module with `useI18n` once put the rich-text
    // pipeline into every react app.
    pinnedChunks: [{ name: "T", test: /src[\\/]T\.tsx/ }],
  }),
  // The prod build (run first) is the one that clears dist/; the dev build
  // adds files to it and must not wipe them.
  ...(suffix === "" ? {} : { emptyOutDir: false }),
});
