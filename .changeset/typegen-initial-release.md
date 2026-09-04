---
"@comvi/typegen": minor
---

Initial release. The TypeScript-declaration emitter that `@comvi/cli` and `@comvi/vite-plugin` used to carry one copy of each, kept in step only by a repo-level parity test: `emitDeclarations(schema, { strictParams, defaultNs, generatedBy })`, plus `countKeyLines` and `normalizeGenerated` for `--check`-style comparisons, and the `SchemaParam` / `KeySchema` / `ProjectSchema` types. Zero dependencies, ESM-only, no `node:` imports — the caller reads the schema and writes the file.

`generatedBy` supplies header line 3, so each tool keeps its own "DO NOT EDIT" wording from the one emitter. No timestamp is stamped: regenerating an unchanged schema produces byte-identical output.
