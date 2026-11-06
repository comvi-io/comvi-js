# Comvi i18n with SolidStart

A SolidStart app that renders translated HTML on the server with [`@comvi/solid`](https://comvi.io/docs/i18n) and keeps following the locale as you navigate. It is built on the [SolidStart recipe](https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart) from the docs. Where it differs:

- the instance and the provider live in a layout, `src/routes/[[locale]].tsx`, rather than in the page, so `/` and `/about` share them, and the language switcher sits there too;
- a loader over bundled catalogs instead of `cdn()`;
- four locales, with `dir` written next to `lang` on the server and after navigation.

## What it shows

- **Locale in the URL**: `/` is English, `/uk`, `/de` and `/ar` are the others. The switcher is a set of links, so a reload or a shared link keeps the locale.
- **One instance per request**: the layout creates the instance on the request event from the route's locale, so two visitors in two languages never share one.
- **Text in the HTML**: `useI18n()` waits through `createResource` under the `<Suspense>` of `src/app.tsx`, and holds the response until the catalogs are in, so a reader without JavaScript and a link preview get the text, not a placeholder.
- **The handover**: `src/entry-server.tsx` writes `handover(i18n)` into a script, and the browser's `createI18n({ ...options, ...window.__I18N__ })` starts from it: the same text, no mismatch, none of it fetched again.
- **Client navigation**: a link to `/uk` calls `setLocale("uk")` in the layout's effect, and `<html lang dir>` follows. Arabic turns the page right-to-left.
- **ICU plurals, `<T>` markup and fallback**: the counter, the documentation link, and an English sentence where Ukrainian has no translation.
- **404** for an unknown first or second segment: `/xx`, `/xx/about`, `/en-US`, `/uk/xx`. `/about`, `/en` and `/en/about` are English.

## Run it

```sh
npm install
npm run dev
```

`npm run build` writes the production server, `npm start` runs it (`node .output/server/index.mjs`), and `npm run typecheck` runs `tsc`.

## Where to look

- `src/lib/i18n.ts`: the locales, the catalog imports and `i18nFor`, the instance of this request or browser.
- `src/routes/[[locale]].tsx`: the layout of the home and about pages: the provider, the effect that follows the URL's locale, and the switcher.
- `src/entry-server.tsx`: writes the request's locale into `<html lang dir>` and the handover into a script.

## Connect your Comvi project

The catalogs in `src/locales` are bundled and load through a loader function. To read them from your Comvi project instead, pass `cdn(cdnUrl)` from `@comvi/core/cdn` (it comes with `@comvi/core`) as `loader` in `src/lib/i18n.ts`, as the recipe does.
