---
"@comvi/cli": patch
---

**Generated declarations are valid TypeScript for every key.** Key and parameter names are
now emitted as JSON strings, so a key containing an apostrophe (`errors.it's`) no longer
closes its own quote and produces a file the compiler cannot parse, and a parameter named
`user-name` no longer emits a bare identifier that is not a legal property name.

A parameter whose type is neither `string` nor `number` is rejected with exit code 4,
naming the key, the parameter and the type, instead of being pasted verbatim into the
declarations.

`comvi typegen --check` counts keys in an existing declaration file written in either quote
style, so the check keeps working against a file left by an earlier version.
