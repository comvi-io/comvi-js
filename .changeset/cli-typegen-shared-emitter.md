---
"@comvi/cli": minor
---

Type generation now runs on `@comvi/typegen`, the emitter `@comvi/vite-plugin` shares, so the two tools cannot drift.

- **Generated files no longer carry a `Generated at:` line.** `comvi typegen` on an unchanged schema rewrites the same bytes, instead of producing a diff on every run.
- **`comvi typegen --check` drops the vanished header line from both sides**, so the `Generated at:` line 0.4 wrote is not by itself a stale verdict. Regenerate once after upgrading: files written by 0.4 compare as outdated under `--check` until then, because 0.5 quotes keys and parameter names with `JSON.stringify` where 0.4 emitted single quotes and bare names, and the comparison does not normalize quoting. Run `comvi typegen` and commit the re-quoted file in the upgrade commit.
- **`--check` exits 4, not 1, when the schema itself cannot be emitted** (two keys that collide once the default namespace is stripped). Exit 1 under `--check` means "types are outdated", so that failure was indistinguishable from real drift. The sibling refusal, an unsupported param type, exits 4 under `--check` as well. Outside `--check` both exit 1: a plain `comvi typegen` reports every failure with exit 1, so a CI step that keys on 4 for "this schema cannot be emitted" has to run `--check`.
- **`TypeEmitter` is deprecated.** It still ships and behaves identically — `new TypeEmitter().generate(schema, { defaultNsName })` — but new code should call `emitDeclarations(schema, { defaultNs })` from `@comvi/typegen`. `SchemaParam`, `KeySchema` and `ProjectSchema` are still exported from `@comvi/cli` under the same names.
