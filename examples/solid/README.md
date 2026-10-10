# Comvi + Solid

A small Solid app that shows what `@comvi/solid` does, one card per feature. Every string on
the page comes from the JSON catalogs in `src/locales`.

## What it shows

- **Parameters**: `{name}` in a sentence; try `?name=Grace` in the address bar.
- **Plurals, select and ordinals**: ICU messages that follow each language's rules.
- **Markup inside a translation**: `<T>` turns `<link>…</link>` into a real anchor.
- **Dates, numbers and currency**: formatted for the current locale.
- **Lazy loading**: a catalog is downloaded the first time its language is picked, and the
  `account` namespace only when the Account page opens.
- **Call options**: one call reads another locale without switching to it.
- **Fallback and missing keys**: English fills the gaps, and every miss reaches `onMissingKey`.
- **Right-to-left**: Arabic sets `<html dir="rtl">`.
- **A second page**: `/about`, with the locale kept across navigation and Back.

## Run it

```bash
npm install
npm run dev
```

`npm run typecheck` runs `tsc --noEmit`, and `npm run build` writes the production bundle.

## Where to look

- `src/i18n.ts` creates the i18n instance: the catalogs, the ICU compiler, the locale detector.
- `src/main.tsx` wraps the router in `<I18nProvider>`; `src/App.tsx` is the shared layout.
- `src/cards/` holds one component per feature, each using `useI18n()`.
- `src/pages/` holds the two routes, `/` and `/about`, served by `@solidjs/router`.

## Connect your Comvi project

The catalogs ship with the app by default. To serve them from your Comvi project instead, set
the CDN URL from your project's Content Deploy at build time:

```bash
VITE_COMVI_CDN_URL=<your CDN URL> npm run build
```

The CDN serves `{cdnUrl}/{locale}.json` for the default namespace and
`{cdnUrl}/{namespace}/{locale}.json` for the others. The local files stay as the fallback when
the CDN cannot be reached. Docs: [comvi.io/docs/i18n](https://comvi.io/docs/i18n).
