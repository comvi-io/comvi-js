---
"@comvi/svelte": minor
---

**BREAKING (0.x minor, WATCHDOG policy).** `<T>` now renders structurally: the translation's parsed VirtualNode tree becomes real DOM nodes via recursive Svelte 5 snippets (`<svelte:element>`), consuming the shared `prepareTranslation` pipeline from `@comvi/core/rich-text`. The entire HTML-string layer is gone — no `{@html}` sink, no `escapeHtml`/`escapeAttr`, no attribute filtering, no tag allowlist. Untrusted translations can only ever produce text and the tags you map; unmapped tags fall back to their inner text.

Behavior/props changes:

- **`components` now accepts Svelte components** (and `{ tag: Component, props }` configs), in parity with the vue/react/solid wrappers. A component handler receives the tag's rendered content as its `children` snippet plus any `props` from the mapping. String and `{ tag: "a", props }` mappings work as before.
- **`allowedTags` prop removed.** There is no HTML-string rendering to allowlist; element mappings come only from your `components` map. Remove the prop — passing it is now a type error.
- **No implicit attribute rewriting.** The old renderer injected `rel="noopener noreferrer"` on `<a target="_blank">`, forced `alt=""` on `<img>`, and stripped `on*`/`srcdoc`/`formaction` attributes from mapping props. Mapping props are developer-owned and now pass through untouched (boolean `false` still omits the attribute), matching the other wrappers. Set `rel`/`alt` explicitly in your mapping props where you relied on the injection.
- Reserved-prop forwarding (`ns`/`locale`/`fallback`/`raw`) now follows the shared rule: a prop overrides the same-named `params` key only when it is not `undefined` (the internal UNSET sentinel is gone). Concrete-value behavior is unchanged.
- **The pipeline comes from a PURE seam.** This changeset originally took `prepareTranslation` from `@comvi/core/tags`, whose import registers tag syntax **ambiently** — so rendering `<T>` anywhere in a svelte app silently switched plain string-API `t()` over to parsing `<tag>` markup too. The single-entry convergence moved it to `@comvi/core/rich-text`, which carries the identical pipeline and registers nothing: `prepareTranslation` hands the tag grammar to core per call. `<T>` renders exactly as described above either way; what changed is that it no longer decides `t()`'s behaviour behind your back. Turning tag syntax on for `t()` is now the app's own `import "@comvi/core/tags"`.
