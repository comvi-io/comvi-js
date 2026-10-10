# Comvi i18n with Nuxt

A small Nuxt 4 app that translates every string with [`@comvi/nuxt`](https://comvi.io/docs/i18n), rendered on the server and hydrated in the browser.

## What it shows

- **Locale in the URL**: `/en`, `/uk`, `/de` and right-to-left `/ar`, with a switcher that navigates between them.
- **Parameters**: `t("greeting.hello", { name })`. Try `?name=Grace` in the address bar.
- **ICU plurals, ordinals and select**: one counter, rendered with each language's own rules.
- **Markup inside a translation**: `<T>` maps `<link>` in the catalog to a real `<a>`.
- **Dates, numbers and currency** formatted for the active locale.
- **Lazy loading**: each catalog is fetched the first time its locale is used, and the `account` namespace only on the About page.
- **Fallback**: a key missing in Ukrainian shows the English text; a missing parameter stays visible.

## Run it

```sh
npm install
npm run dev
```

The start page at `/` is the whole integration: a header, a translated line and the switcher. `/features` shows every feature as a card. The source to read first is `src/comvi.i18n.ts` (the i18n setup) and `nuxt.config.ts` (locales and routing). Each feature card is one component under `src/components/`.

## Connect your own Comvi project

The app reads its catalogs from `src/locales` by default. To load the translations published from your Comvi project instead, set your project's CDN URL:

```sh
NUXT_PUBLIC_COMVI_CDN_URL=https://cdn.comvi.io/<project-token> npm run dev
```

The bundled catalogs stay as the fallback if the CDN cannot be reached.
