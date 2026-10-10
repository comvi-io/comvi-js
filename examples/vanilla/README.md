# Comvi + vanilla TypeScript

One page with no framework: `@comvi/core` and plain DOM code, built with Vite.

## What it shows

- **Parameters:** `{name}` filled in from the call, and HTML in a parameter stays text.
- **Plurals and ordinals:** ICU `plural` and `selectordinal` on one counter, with the rules of each language.
- **Select:** ICU `select` picks a whole sentence by a value.
- **Markup in a translation:** `<link>…</link>` in the catalog, turned into an `<a>` by a handler in `tRaw()`.
- **Dates, numbers and currency:** formatted for the current locale.
- **Lazy loading:** a language is downloaded the first time it is picked, and the `account` namespace the first time the Account page opens.
- **Fallback:** a key missing in Ukrainian shows the English text; a key missing everywhere shows its name.
- **Missing-key hook:** every miss reaches `i18n.on("missingKey")`.
- **Right-to-left:** Arabic sets `<html dir="rtl">`.
- **Locale detection:** `?lng=`, then the last choice, then the browser language.

## Run it

```bash
npm install
npm run dev
```

## Connect your Comvi project

The catalogs in `src/locales` are bundled with the app. To load them from your Comvi project's CDN
instead, set its CDN URL at build time. The local files stay as the fallback when the CDN cannot
be reached.

```bash
VITE_COMVI_CDN_URL="<your project's CDN URL>" npm run build
```

## Where to look

- `src/i18n.ts`: the instance, the loader and the locale detector.
- `src/components/cards.ts`: one function per feature card.
- `src/router.ts`: the second page, with the History API.
