# Comvi i18n with SvelteKit

A SvelteKit app that renders translated HTML on the server with [`@comvi/svelte`](https://comvi.io/docs/i18n) and keeps following the locale as you navigate. It is built on the [SvelteKit recipe](https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart) from the docs. Where it differs:

- `loader()` with bundled catalogs instead of `cdnLoader`, and ICU messages through `icuCompiler`;
- four locales, with the hook writing `dir` as well as `lang`;
- the language switcher and a second page, `/about`, in the root layout's routes.

## What it shows

- **Locale in the URL**: `/` is English, `/uk`, `/de` and `/ar` are the others. The switcher is a set of links, so a reload or a shared link keeps the locale.
- **One instance per request**: `load` builds an instance, loads the catalogs and returns them as plain data, so two visitors in two languages never share one.
- **No flash on hydration**: the browser's instance starts from that data, so the first paint is already translated.
- **Client navigation**: a link to `/uk` hands the new data to the same instance, and `<html lang dir>` follows. Arabic turns the page right-to-left.
- **ICU plurals, `<T>` markup and fallback**: the counter, the documentation link, and an English sentence where Ukrainian has no translation.
- **404** for an unknown first or second segment: `/xx`, `/xx/about`, `/en-US`, `/uk/xx`. `/about`, `/en` and `/en/about` are English.

## Run it

```sh
npm install
npm run dev
```

`npm run build` writes the production server, `npm start` runs it (`node build`), and `npm run typecheck` runs `svelte-check`.

## Where to look

- `src/routes/+layout.server.ts`: the request-scoped instance and the payload.
- `src/routes/+layout.svelte`: the browser's instance, built once, and the `$effect.pre` that switches it on every navigation.
- `src/hooks.server.ts`: writes the request's locale into `<html lang dir>` in `src/app.html`.
- `src/lib/i18n.ts`: the locales and the catalog imports.

## Connect your Comvi project

The catalogs in `src/locales` are bundled and load through `loader()`. To read them from your Comvi project instead, install the fetch loader:

```sh
npm install @comvi/plugin-fetch-loader
```

and return `cdnLoader({ cdnUrl })` from it in `catalogLoader`, as the recipe does.
