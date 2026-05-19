---
"@comvi/next": major
---

**Major release — React 18+ baseline (via `@comvi/react`), render-time mutation removal, locale validation.**

### Added

- Locale validation against `routing.locales` in `<I18nProvider>`. When the provider receives a `routing` prop and the `locale` prop is not in `routing.locales`, the provider calls `i18n.reportError(...)` with a descriptive diagnostic and skips the mutation. When `routing` is omitted, behavior is unchanged.

### Changed

- `<I18nProvider>` internals: locale sync and message bootstrap moved from the render body to a `useState(() => ...)` lazy initializer. The previous render-time mutation pattern (`i18n.locale = locale`, `i18n.addTranslations(messages)` guarded by `isFirstRenderRef`) is replaced; the side effect now lives in a React-blessed lifecycle slot before the first commit. Behavior is identical from a consumer's perspective.
- `<Link>`, `usePathname()`, and `useLocalizedRouter()` switched from `useI18n()` to `useLocale()` — non-translation routing consumers no longer re-render on namespace loads.

### Removed

- React 16.8–17 peer support via the `@comvi/react` major bump.
- Duplicate `src/client/index.ts` re-export module — `src/client.ts` is the single source of truth for the `./client` subpath.

### Internal

- Peer dependencies on `@comvi/core` and `@comvi/react` bumped accordingly.
- New `next-hydration.test.tsx` asserts `renderToString` + `hydrateRoot` produces zero hydration warnings, and a boundary test asserts no `i18n.locale = …` mutation appears outside the dedicated `syncLocaleSafely` helper in `client/I18nProvider.tsx`.

See `docs/migration/v0.2-to-v0.3.md` for the upgrade checklist.
