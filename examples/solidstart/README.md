# Comvi i18n with SolidStart

A SolidStart app that renders translated HTML on the server with [`@comvi/solid`](https://comvi.io/docs/i18n) and keeps following the locale as you navigate. It is the [SolidStart recipe](https://comvi.io/docs/i18n/ssr#solidstart) from the docs, run as an app.

## What it shows

- **Locale in the URL**: `/` is English, `/uk`, `/de` and `/ar` are the others. The switcher is a set of links, so a reload or a shared link keeps the locale.
- **One instance per request**: a server function loads the catalogs in an instance of its own and returns them as plain data, and the route builds a fresh instance from that data, so two visitors in two languages never share one.
- **Text in the HTML**: `deferStream` holds the response until the catalogs are in, so a reader without JavaScript and a link preview get the text, not a placeholder.
- **Client navigation**: a link to `/uk` loads uk's data and swaps in a new instance, and `<html lang dir>` follows. Arabic turns the page right-to-left.
- **ICU plurals, `<T>` markup and fallback**: the counter, the documentation link, and an English sentence where Ukrainian has no translation.
- **404** for a path whose first segment is not a locale.

## Run it

```sh
npm install
npm run dev
```

`npm run build` writes the production server, `npm start` runs it (`node .output/server/index.mjs`), and `npm run typecheck` runs `tsc`.

## Where to look

- `src/lib/i18n.ts`: the locales, the catalog imports and `loadI18n`, the server function.
- `src/routes/[[locale]].tsx`: the layout every page renders in: the resource keyed on the URL's locale, the instance built from its data, and the switcher.
- `src/entry-server.tsx`: writes the request's locale into `<html lang dir>`.

## Connect your Comvi project

The catalogs in `src/locales` are bundled and load through `loader()`. To read them from your Comvi project instead, return `cdnLoader({ cdnUrl })` from `@comvi/plugin-fetch-loader` in `catalogLoader`, as the recipe does.
