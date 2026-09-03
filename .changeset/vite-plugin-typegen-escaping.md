---
"@comvi/vite-plugin": patch
---

**Generated declarations are valid TypeScript for every key, and match the CLI's output
byte for byte.** Key and parameter names are emitted as JSON strings, so a key containing an
apostrophe (`errors.it's`) no longer closes its own quote, and a parameter named `user-name`
is no longer emitted as a bare identifier.

Keys are ordered by code unit rather than by `localeCompare`, which is what `@comvi/cli`
already did — generating types with the plugin in dev and with the CLI in CI no longer
produces two files that differ only in key order.

A parameter whose type is neither `string` nor `number` is rejected with an error naming the
key, the parameter and the type, instead of being pasted verbatim into the declarations.
