---
"@comvi/next": patch
---

Fix type resolution for CJS consumers and align package metadata.

- Split all 6 subpath exports (`.`, `./server`, `./client`, `./middleware`, `./routing`, `./navigation`) into nested per-condition `import`/`require` blocks, each carrying its own `types` key (`.d.ts` for ESM, `.d.cts` for CJS). Eliminates the publint FalseCJS warning across every entry point.
- Add `engines.node: ">=22"` to match the workspace root constraint.
- Fix `repository.url` to include the required `git+` prefix.
