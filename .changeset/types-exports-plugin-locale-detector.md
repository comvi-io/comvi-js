---
"@comvi/plugin-locale-detector": minor
---

Fix type resolution for CJS consumers and align package metadata.

- Split `exports["."]` into nested per-condition `import`/`require` blocks, each carrying its own `types` key (`index.d.ts` for ESM, `index.d.cts` for CJS). Eliminates the publint FalseCJS warning where the top-level `types` field was incorrectly interpreted under the `require` condition.
- Add `engines.node: ">=22"` to match the workspace root constraint.
- Fix `repository.url` to include the required `git+` prefix.
