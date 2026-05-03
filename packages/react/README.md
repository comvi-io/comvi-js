<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/react</h1>

<p align="center">React binding for Comvi i18n — provider, hook, and <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/react"><img src="https://img.shields.io/npm/v/@comvi/react?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=%40comvi%2Freact"><img src="https://deno.bundlejs.com/?q=@comvi/react&badge=&badge-style=flat&badge-raster" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/react` wraps [`@comvi/core`](../core) for React. `<I18nProvider>` mounts an instance and auto-initializes it; `useI18n()` reads from it via `useSyncExternalStore`, so re-renders are precise and concurrent-mode safe. Works with React 16.8+ via the `use-sync-external-store` shim.

Same `t()` and `<T>` API as the [Vue](../vue), [SolidJS](../solid), and [Svelte](../svelte) bindings — switch frameworks without relearning your i18n layer.

For Next.js App Router, use [`@comvi/next`](../next) — it adds SSR, middleware, and locale routing on top of this package.

📖 **Documentation:** https://comvi.io/docs/i18n/react/

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~8 kB gzipped, zero runtime dependencies.** No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.

## Why @comvi/react?

- **Concurrent rendering safe.** Built on `useSyncExternalStore` — no tearing, safe with Suspense, Time Slicing, and Transitions.
- **Broad version support.** Works with React 16.8+ through 19 (via `use-sync-external-store` polyfill), so teams on older versions don't need a major rewrite.
- **Provider auto-init.** Wrap your app in `<I18nProvider>` and it handles initialization automatically — no manual `i18n.init()` calls.

## Install

```bash
npm install @comvi/react
# Peer: react ^16.8 || ^17 || ^18 || ^19
```

## Quick start

```tsx
// main.tsx
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
);
```

```tsx
// App.tsx
import { useI18n } from "@comvi/react";

export default function App() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

For `<T>` rich-text components, type-safe keys, fetch-loader integration, and the full hook API, see the [documentation](https://comvi.io/docs/i18n/react/).

## Rich text with `<T>`

Embed components inside translation strings without raw HTML, without unsafe DOM injection. Translators see clean markup; you control the rendering via the `components` prop.

```json
{ "help": "Click <link>here</link> for support, or <bold>read the docs</bold>." }
```

```tsx
import { T } from "@comvi/react";

export default function Help() {
  return (
    <T
      i18nKey="help"
      components={{
        link: <a href="/help" />,
        bold: <strong />,
      }}
    />
  );
}
```

The `link` and `bold` elements are cloned with children injected automatically. Pass `tagInterpolation: { strict: "warn" }` to `createI18n` to catch translations referencing tags you forgot to handle before they ship.

## ICU MessageFormat — locale-correct grammar, not just singular/plural

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish, Ukrainian, Arabic, Welsh, and 30+ other locales — those languages have 3, 4, sometimes 6 distinct plural categories that a binary if/else can't express. [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the standard syntax for handling them — the same syntax Crowdin, Lokalise, Phrase, and every major TMS already speak. Comvi i18n parses it via native [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules), so every CLDR plural category is correct by default.

### Plurals across languages

```json
{
  "en": { "messages": "{count, plural, one {# message} other {# messages}}" },
  "uk": {
    "messages": "{count, plural, one {# повідомлення} few {# повідомлення} many {# повідомлень} other {# повідомлення}}"
  },
  "ar": {
    "messages": "{count, plural, zero {لا توجد رسائل} one {رسالة واحدة} two {رسالتان} few {# رسائل} many {# رسالة} other {# رسالة}}"
  }
}
```

```ts
t("messages", { count: 0 }); // ar: "لا توجد رسائل"      (zero form)
t("messages", { count: 1 }); // en: "1 message"            uk: "1 повідомлення"
t("messages", { count: 5 }); // en: "5 messages"           uk: "5 повідомлень"          ar: "5 رسائل"
t("messages", { count: 22 }); // uk: "22 повідомлення"  ← the "few" form, NOT the "many" form
```

A naive English-style `count === 1 ? singular : plural` picks one Ukrainian form and ships it for every count — grammatically wrong for half your traffic.

### Ordinals (1st, 2nd, 3rd…)

```json
{ "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" }
```

```ts
t("rank", { place: 1 }); // "1st"
t("rank", { place: 22 }); // "22nd"
t("rank", { place: 113 }); // "113th"
```

### Select (gender, role, status)

```json
{ "greeting": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}" }
```

```ts
t("greeting", { gender: "female" }); // "Welcome, madam"
t("greeting", { gender: "male" }); // "Welcome, sir"
t("greeting", { gender: "other" }); // "Welcome"
```

### Locale-aware Intl formatters

Numbers, dates, currency, and relative time follow the active locale via native `Intl` — reactive in your framework binding:

```tsx
import { useI18n } from "@comvi/react";

function Stats() {
  const { t, formatNumber, formatCurrency, formatRelativeTime } = useI18n();

  // Locale-aware plurals
  const items = t("items", { count: 5 });

  return (
    <div>
      <p>{items}</p>
      <p>Total: {formatCurrency(1234.56, "USD")}</p>
      <p>Growth: {formatNumber(1.25, { style: "percent" })}</p>
      <p>Posted {formatRelativeTime(-2, "hour")}</p>
    </div>
  );
}
```

Switching locale via `setLocale()` triggers re-renders through `useSyncExternalStore` — formatters always reflect the current language.

## Type-safe translation keys

Declaration merging on `TranslationKeys` provides autocomplete and parameter validation per key. Generated automatically via `@comvi/cli` (TMS) or `@comvi/vite-plugin` (local JSON).

```typescript
// src/types/i18n.d.ts
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: never;
    "errors:NOT_FOUND": never;
  }
}
```

```tsx
import { useI18n } from "@comvi/react";

function Welcome() {
  const { t } = useI18n();

  // ✓ Autocomplete works, params required
  const msg = t("welcome", { name: "Alice" });

  // ✓ No params needed
  const greeting = t("greeting");

  // ✓ Namespaced keys use the ns option
  const notFound = t("NOT_FOUND", { ns: "errors" });

  return <h1>{msg}</h1>;
}
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
t("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
t("typo", { name: "Alice" });
```

## Loading translations from the Comvi platform

Pair with `@comvi/plugin-fetch-loader` to load translations from a CDN or API. No redeploy needed to ship a translation:

```tsx
// main.tsx
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import { FetchLoader } from "@comvi/plugin-fetch-loader";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  defaultNs: "common",
});

// CDN for production, API for dev/staging
i18n.use(
  FetchLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id",
  }),
);

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
);
```

See [`@comvi/plugin-fetch-loader`](https://github.com/comvi-io/comvi-js/tree/main/packages/plugin-fetch-loader) for full options and API endpoints.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
