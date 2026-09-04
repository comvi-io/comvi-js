---
"@comvi/vite-plugin": minor
---

Type generation now runs on `@comvi/typegen`, the emitter `@comvi/cli` shares, so the two tools cannot drift. Output is unchanged, header line included.

One behaviour follows from the shared copy: two keys that converge once the default namespace is stripped are now refused with a `Translation key collision` error. The plugin used to keep whichever key came last, so a key disappeared from the declarations silently. `@comvi/cli` has always refused it. During a build the refusal throws, so a schema that built yesterday can fail `vite build`; `vite dev` reports it and carries on.
