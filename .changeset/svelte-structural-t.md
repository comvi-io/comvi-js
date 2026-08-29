---
"@comvi/svelte": minor
---

**BREAKING (0.x minor, WATCHDOG policy).** `<T>` now renders structurally: the translation's
parsed VirtualNode tree becomes real DOM nodes via recursive Svelte 5 snippets
(`<svelte:element>`), consuming the shared `prepareTranslation` pipeline from the pure
`@comvi/core/rich-text` seam. The entire HTML-string layer is gone — no `{@html}` sink, no
`escapeHtml` / `escapeAttr`, no attribute filtering, no tag allowlist. Untrusted
translations can only ever produce text and the tags you map; unmapped tags fall back to
their inner text.

- **`components` now accepts Svelte components** (and `{ tag: Component, props }` configs),
  in parity with the vue / react / solid wrappers. A component handler receives the tag's
  rendered content as its `children` snippet plus any `props` from the mapping. String and
  `{ tag: "a", props }` mappings work as before.
- **`allowedTags` is removed.** There is no HTML-string rendering to allowlist; element
  mappings come only from your `components` map. Passing the prop is now a type error.
- **No implicit attribute rewriting.** The old renderer injected `rel="noopener noreferrer"`
  on `<a target="_blank">`, forced `alt=""` on `<img>`, and stripped `on*` / `srcdoc` /
  `formaction` from mapping props. Mapping props are developer-owned and now pass through
  untouched (boolean `false` still omits the attribute). Set `rel` / `alt` explicitly where
  you relied on the injection.
- Reserved-prop forwarding (`ns` / `locale` / `fallback` / `raw`) follows the shared rule: a
  prop overrides the same-named `params` key only when it is not `undefined`. Concrete-value
  behaviour is unchanged.
- **The pipeline comes from a PURE seam**, so rendering `<T>` no longer switches plain
  string-API `t()` over to parsing `<tag>` markup. That is now the app's own
  `import "@comvi/core/tags"`.
