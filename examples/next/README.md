# Comvi + Next.js (App Router)

Server-rendered pages per locale with `@comvi/next`: `/en`, `/uk`, `/de` and `/ar` are prerendered,
the middleware sends `/` to the visitor's language, and the switcher navigates between them.

## What it shows

- **Parameters:** `{name}` filled in from the call, and HTML in a parameter stays text.
- **Plurals and ordinals:** ICU `plural` and `selectordinal` on one counter, with the rules of each language.
- **Select:** ICU `select` picks a whole sentence by a value.
- **Markup in a translation:** `<T>` turns `<link>…</link>` from the catalog into a real `<a>`.
- **Dates, numbers and currency:** formatted for the current locale.
- **Server and client:** Server Components call `getI18n({ locale })`, client components `useI18n()`,
  and the first HTML is already translated.
- **Namespaces:** the `account` namespace is loaded only by the `/about` route's layout.
- **Fallback:** a key missing in Ukrainian shows the English text; a key missing everywhere shows its name.
- **Missing-key hook:** every miss reaches `i18n.on("missingKey")`.
- **Right-to-left:** Arabic renders `<html dir="rtl">`.

## Run it

```bash
npm install
npm run dev
```

<!--
  `next` is pinned to `~15.4.11` on purpose. StackBlitz runs this example in WebContainers, and
  Next 15.5 and later do not start there (vercel/next.js#84026). Move the pin forward once that
  issue is fixed; the code needs no change for a newer 15.x or 16.x.
-->

## Connect your Comvi project

The catalogs in `src/locales` are bundled with the app. To load them from your Comvi project's CDN
instead, set its CDN URL at build time. The local files stay as the fallback when the CDN cannot
be reached.

```bash
NEXT_PUBLIC_COMVI_CDN_URL="<your project's CDN URL>" npm run build
```

## Where to look

- `src/i18n/config.ts`: the instance and its loader.
- `src/i18n/routing.ts` and `src/middleware.ts`: the locale in the URL.
- `src/app/[locale]/cards/`: one client component per feature card.
