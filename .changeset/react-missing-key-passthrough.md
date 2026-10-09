---
"@comvi/react": patch
---

`useI18nPlugins().onMissingKey` no longer wraps the callback in a `String(result)` coercion. The member is now the bound instance method, typed as core's `I18nPluginApi["onMissingKey"]` verbatim, so a callback may return the full `TranslationResult` core accepts — a string OR the `Array<string | VirtualNode>` a rich-text fallback needs — and core decides what to do with it. The coercion was a react-only semantic the other bindings never had; it turned an array fallback into `"rich-,[object Object]"`. All four bindings reach the member the same way, through `acquirePluginsApi(instance)` from `@comvi/core/plugins`, and `scripts/wrapper-hooks-parity.test.mjs` pins that their capability hooks keep the same member sets.
