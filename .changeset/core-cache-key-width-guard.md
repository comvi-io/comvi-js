---
"@comvi/core": patch
---

Development now warns when a template-cache key is about to silently truncate.

The key packs the parse context into two UTF-16 code units: one holds the `#`-is-syntax flag plus
the extension bitfield, the other holds the compiler id. Both fields are applied through
`ToUint16`, so anything wider than they hold was dropped without a sound, and two different
parses could then share one cache entry and serve each other's tokens.

Two guards, both development only:

- A `SyntaxExtension` registered with a `cacheBit` above `0x4000` is warned about, because the
  bit does not survive the key and the extension's parses would collide with parses made without
  it. `SyntaxExtension.cacheBit` now documents the 15-bit budget and that `0x4000` is the highest
  usable value.
- Creating more than 65535 message compilers in one process is warned about once, since compiler
  ids wrap at that point. This is reachable by constructing a compiler per request on a
  long-running server; reuse one instance instead.

The production bundle is byte-identical.
