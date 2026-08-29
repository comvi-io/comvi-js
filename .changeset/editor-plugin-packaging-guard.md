---
"@comvi/plugin-in-context-editor": patch
---

Packaging and production hardening. Every bundled dependency moved from `dependencies` to
`devDependencies`, so `@comvi/plugin-in-context-editor` now declares no runtime dependencies
at all and installing it pulls nothing into your tree. The UI libraries are compiled into
`dist/index.es.js`; `@comvi/plugin-fetch-loader` went the same way, because the only module
that names it is the standalone IIFE, which inlines it — no published entry could load it as
a runtime dependency.

The full entry's plugin factory now also returns a no-op plugin at runtime when
`NODE_ENV=production`, as a belt-and-braces guard for bundlers that ignore the `"production"`
export condition (which already resolves to the lightweight stub). No API changes.
