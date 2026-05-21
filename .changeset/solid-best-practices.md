---
"@comvi/solid": minor
---

SolidJS best-practices fixes for `@comvi/solid`.

- Add an optional `onError` prop to `<I18nProvider>` so apps can observe auto-initialization failures (parity with the other framework bindings). The error is still reported through core's error handler.
- `<T>` now resolves its fallback `children` lazily — only when a translation is actually missing — instead of eagerly on every render. Fallback subtrees with side effects no longer run when the translation exists.
- `<T components={{ tag: fn }}>` function mappings now render through Solid's component path (`createComponent`) like the `{ tag: Component }` object form, instead of being invoked as a bare function — giving them a proper owner/context.
- `<T locale="…">` and `tRaw(key, { locale })` no longer subscribe to the global locale signal, avoiding needless recomputes when the app locale changes while an explicit locale is pinned.
- Document the `t()`/`tRaw()` reactivity caveat (must be called inside a tracking scope) and add a Server-Side Rendering note clarifying the package is CSR-only today.
- Remove the misleading `ssr`/`ssg`/`server-components` keywords from the package (no server-side rendering support).
