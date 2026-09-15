---
"@comvi/vite-plugin": patch
---

Type generation now reads ICU exactly as the runtime does, so the generated parameters are the ones your messages actually consume. Seven forms disagreed before: `{ name }`, `{name x}` and `{0} items` are real parameters at runtime but were typed as taking none; `{price, number}`, `{when, date, short}`, `{n, pluralx, …}` and any of `plural`/`select` with a malformed choice list produced a required parameter although `@comvi/core` implements no such argument type and refuses the whole key; and `a { b {name}` invented `name`, where an unclosed brace makes the rest of the message literal text.

A key whose message carries ICU syntax core does not implement now generates no parameters and is reported during generation, naming the key, the file and the argument type. It stays a key — you can still call it — instead of demanding an argument at a call that would throw.

The reading is pinned by a parity test that drives every message form through `@comvi/core`'s own compiler and compares the parameters it consumes, so a change to core's grammar fails the build instead of silently desynchronizing your types.
