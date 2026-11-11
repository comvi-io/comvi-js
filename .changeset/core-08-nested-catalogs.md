---
"@comvi/core": minor
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Nested catalogs: `{ "account": { "greeting": "…" } }` is the key `account.greeting`, the same key as `{ "account.greeting": "…" }`, in `messages`, a catalog of `catalogs`, `add()`, a loader's result and a binding's handover (`CatalogInput` types them). Inside, catalogs stay flat and `t()` walks nothing; a catalog of strings is kept as is, without a copy, and no input is changed. Nesting groups keys; it creates no namespace, and `handover()` hands flat catalogs over. A key defined both flat and through nesting keeps its first leaf (the catalog's own key order) and a leaf that is not a string is left out; each is reported through `onError` as `syntax` in every build (development adds the explanation). `__proto__` and `constructor` are keys like any other. `comvi typegen` and the Vite plugin read catalogs by the same rule, so the generated types name the keys the runtime reads, and warn about what it leaves out; `comvi push` flattens by it too and refuses such a file, as before.
