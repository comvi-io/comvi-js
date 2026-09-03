---
"@comvi/next": minor
---

**BREAKING (breaking change on a 0.x minor): `<T>` from `@comvi/next/client` no longer enables
ambient string-API tag syntax.** The component is React's exact `T` binding and now reaches
the pure `@comvi/core/rich-text` seam: it still renders rich text with the same `components`
API, but importing or rendering it no longer changes later `i18n.t("<tag>…</tag>")` calls.

This removes a module-global side effect from native ESM and from webpack development
graphs. If string-API `t()` must parse tag markup, `import "@comvi/core/tags"` explicitly at
the application entry.
