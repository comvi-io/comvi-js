---
"@comvi/core": patch
---

The post-processor chain moved out of the base host into the plugin capability.

`postProcess` is a constructor option on every host, so the base kept the whole chain
machinery — an array field, a `push`, and an indexed loop — to serve the at most ONE processor a
bare host can have. The base now holds a single optional slot applied with one guarded call, and
`@comvi/core/plugins` owns the array and the loop: `registerPostProcessor()` seeds the chain with
the constructor option, takes the slot over with its own chaining applier, and appends from there.

Internal only, no behaviour change. The `postProcess` and `onMissingKey` constructor options stay
universal; a throwing processor is still swallowed, still reported as `source: "post-processor"`
with the key and namespace, and still leaves the later processors in a chain running; the
paramless static-template fast path still post-processes; `destroy()` still drops both. `core-base`
is 24 bytes (min+gz) smaller.
