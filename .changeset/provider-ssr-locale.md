---
"@comvi/solid": minor
"@comvi/react": minor
"@comvi/next": patch
---

**One name for the SSR render locale: `ssrLocale`.** `@comvi/solid` had no way to seed one, though it has `renderToString` and hydration, so a server render could only ever paint the host's configured locale and the hydrating client silently disagreed with it until the first reactive update repainted. `<I18nProvider ssrLocale="fr">` now adopts that locale onto the host at mount, before the locale signal is seeded — the same contract `@comvi/vue`'s option of that name has, and the reason `t()` and `locale()` cannot drift apart. `@comvi/react` accepts `ssrLocale` as well, as an alias of its own `ssrInitialLocale`: react keeps that name canonical, it wins when both are passed, and a development build warns that it did. React's `ssrInitialIsLoading` / `ssrInitialIsInitializing` are deliberately not ported — they exist for `useSyncExternalStore`'s server snapshot and are correctly react-only. `@comvi/next` omits both spellings from its provider props, since it sets the render locale from its own `locale` prop and either one passed there would be silently overridden.
