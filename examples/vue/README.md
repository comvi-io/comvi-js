# Comvi + Vue example

A small Vue app where every string comes from a translation catalog. Switch
between English, Ukrainian, German and Arabic and watch each feature follow.

## What it shows

`/` is the whole integration in one screen: a translated greeting and the
language switcher. `/features` walks through every feature:

- Parameters: `t("greeting.hello", { name })`
- ICU plurals, ordinals and select, with each language's own plural rules
- Markup inside a translation with `<T>`, where the app decides what a tag renders as
- Locale-aware dates, numbers and currency
- Lazy loading: a language is downloaded the first time it is picked
- A second namespace (`account`) that loads only when its page opens
- Fallback to English for a missing key, and a visible key when it is missing everywhere
- Right-to-left layout for Arabic through `<html dir>`
- A second route with Vue Router, keeping the chosen language

## Run it

```sh
npm install
npm run dev
```

## Connect your own Comvi project

The catalogs in `src/locales` are bundled with the app. To serve translations
from your Comvi project instead, set the CDN URL of your project before you
build or start the dev server:

```sh
VITE_COMVI_CDN_URL=https://cdn.comvi.io/<your-project> npm run dev
```

The bundled catalogs stay as the fallback when the CDN cannot be reached. The
setup lives in `src/i18n.ts`.

Docs: https://comvi.io/docs/i18n
