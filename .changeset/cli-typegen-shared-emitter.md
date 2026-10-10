---
"@comvi/cli": minor
---

Type generation now runs on one shared emitter, the same one `@comvi/vite-plugin` uses, so the two tools cannot drift. The emitter is workspace-private and is bundled into this package — **no new dependency, nothing extra to install**, and the published types still declare `SchemaParam`, `KeySchema` and `ProjectSchema` themselves.

- **Generated files no longer carry a `Generated at:` line.** `comvi typegen` on an unchanged schema rewrites the same bytes, instead of producing a diff on every run.
- **`comvi typegen --check` drops the vanished header line from both sides**, so the `Generated at:` line 0.4 wrote is not by itself a stale verdict. Regenerate once after upgrading: files written by 0.4 compare as outdated under `--check` until then, because 0.5 quotes keys and parameter names with `JSON.stringify` where 0.4 emitted single quotes and bare names, and the comparison does not normalize quoting. Run `comvi typegen` and commit the re-quoted file in the upgrade commit.
- **`--check` exits 4, not 1, when the schema itself cannot be emitted** (two keys that collide once the default namespace is stripped). Exit 1 under `--check` means "types are outdated", so that failure was indistinguishable from real drift. The sibling refusal, an unsupported param type, exits 4 under `--check` as well. Outside `--check`, a generation failure exits 1; an invalid config still exits 4. So a CI step that keys on 4 for "this schema cannot be emitted" has to run `--check`.
- **`TypeEmitter` stays public.** `new TypeEmitter().generate(schema, { defaultNsName })` and the `comvi typegen` command are the two supported entry points, unchanged.
