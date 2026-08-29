---
"@comvi/react": patch
---

`useI18nPlugins().onMissingKey` no longer wraps the callback in a `String(result)` coercion. The member is now the bound host method, typed as core's `I18nPluginHostApi["onMissingKey"]` verbatim, so a callback may return the full `TranslationResult` core accepts — a string OR the `Array<string | VirtualNode>` a rich-text fallback needs — and core decides what to do with it. The coercion was a react-only semantic the other bindings never had; it turned an array fallback into `"rich-,[object Object]"`. All four bindings now share a byte-identical capability block, pinned by `scripts/wrapper-hooks-parity.test.mjs`.
