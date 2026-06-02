---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/vue": minor
"@comvi/solid": minor
"@comvi/next": minor
"@comvi/cli": minor
"@comvi/vite-plugin": minor
"@comvi/plugin-fetch-loader": minor
"@comvi/plugin-locale-detector": minor
"@comvi/plugin-in-context-editor": minor
---

**BREAKING: these packages are now ESM-only.**

v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).

- **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
- The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
- This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
- `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
- Package metadata: `repository.url` carries the required `git+` prefix.
