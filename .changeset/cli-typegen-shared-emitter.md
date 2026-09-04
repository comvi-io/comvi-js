---
"@comvi/cli": minor
---

Type generation now runs on `@comvi/typegen`, the emitter `@comvi/vite-plugin` shares, so the two tools cannot drift.

- **Generated files no longer carry a `Generated at:` line.** `comvi typegen` on an unchanged schema rewrites the same bytes, instead of producing a diff on every run.
- **`comvi typegen --check` accepts a file written by 0.4.** The comparison drops the whole timestamp line from both sides, so upgrading does not report every existing repository as stale.
- **`--check` exits 4, not 1, when the schema itself cannot be emitted** (two keys that collide once the default namespace is stripped). Exit 1 under `--check` means "types are outdated", so that failure was indistinguishable from real drift; the sibling refusal, an unsupported param type, has always exited 4.
- **`TypeEmitter` is deprecated.** It still ships and behaves identically — `new TypeEmitter().generate(schema, { defaultNsName })` — but new code should call `emitDeclarations(schema, { defaultNs })` from `@comvi/typegen`. `SchemaParam`, `KeySchema` and `ProjectSchema` are still exported from `@comvi/cli` under the same names.
