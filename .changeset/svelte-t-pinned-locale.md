---
"@comvi/svelte": patch
---

`<T locale="de">` no longer re-renders when the app's global locale changes.

Svelte's cache-revision store bumped on core's whole revision event set, the locale and
loading-state axes included. Both already have their own stores, so `<T>` was subscribed to the
locale twice — and a component that had pinned a locale recomputed its translation on every global
locale switch and on every `isLoading` flip, even though its answer could not have changed. On a
page with many pinned `<T>` elements, a single locale switch re-ran all of them for nothing.

The revision store now ignores `localeChanged` and `loadingStateChanged`, matching the Solid
binding, and `<T>` reads the locale store only when no `locale` prop is given. An unpinned `<T>`
follows the global locale exactly as before, and a catalog change still reaches a pinned one.
