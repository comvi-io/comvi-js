<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/solid</h1>

<p align="center">SolidJS binding for Comvi i18n — provider, reactive signals, and <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/solid"><img src="https://img.shields.io/npm/v/@comvi/solid?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/solid"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/solid?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/solid` wraps [`@comvi/core`](../core) for SolidJS. `<I18nProvider>` mounts an instance; `useI18n()` returns reactive signals that integrate with Solid's fine-grained reactivity. Signals are functions — call `locale()` to read the value.

Same `t()` and `<T>` API as the [Vue](../vue), [React](../react), and [Svelte](../svelte) bindings — switch frameworks without relearning your i18n layer.

📖 **Documentation:** https://comvi.io/docs/i18n/solid/

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~8 kB gzipped, zero runtime dependencies.** No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.

## Why @comvi/solid?

- **Fine-grained reactivity.** `useI18n()` returns signals and reactive primitives — only components that read a specific value re-run, no prop drilling.
- **Function-based `<T>` component.** Avoids Solid's conditional branch caching pitfalls by using functions for tag rendering instead of components.
- **Direct signal access.** Export utility functions like `createLocaleSignal()` and `createLoadingSignal()` for advanced patterns that need lower-level reactivity primitives.

## Install

```bash
npm install @comvi/solid
# Peer: solid-js ^1.8.0
```

## Quick start

```tsx
// index.tsx
import { render } from "solid-js/web";
import { createI18n, I18nProvider } from "@comvi/solid";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

render(
  () => (
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

```tsx
// App.tsx
import { useI18n } from "@comvi/solid";
import { createSignal } from "solid-js";

export default function App() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <select value={locale()} onChange={(e) => setLocale(e.currentTarget.value)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

For `<T>` rich-text components, type-safe keys, and the full reactive primitives, see the [documentation](https://comvi.io/docs/i18n/solid/).

## Rich text with `<T>`

Tag interpolation lets translators write readable markup like `"Click <link>here</link> for help"` without raw HTML or XSS risk. You decide what each tag renders to — a function that receives the tag's content as children JSX:

```json
{
  "help": "For support, <link>visit our docs</link> or <bold>email us</bold>.",
  "privacy": "We take privacy seriously. <policy>Read our policy</policy>."
}
```

```tsx
import { T } from "@comvi/solid";

function Help() {
  return (
    <T
      i18nKey="help"
      components={{
        // Each component is a function, not a Solid component.
        // This avoids Solid's conditional branch caching pitfall.
        link: ({ children }) => <a href="/docs">{children}</a>,
        bold: ({ children }) => <strong>{children}</strong>,
      }}
    />
  );
}

// Renders: "For support, <a href="/docs">visit our docs</a> or <strong>email us</strong>."
```

You can also map to plain HTML tags:

```tsx
<T i18nKey="privacy" components={{ policy: "a" }} />
// Renders: <a>Read our policy</a>
```

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
import { createSignal } from "solid-js";
import { useI18n } from "@comvi/solid";

function Dashboard() {
  const { t, formatNumber, formatDate, formatCurrency, formatRelativeTime } = useI18n();
  const [itemCount, setItemCount] = createSignal(5);

  return (
    <>
      {/* Plurals automatically match locale */}
      <p>{t("items", { count: itemCount() })}</p>

      {/* Locale-aware formatting — switches when locale changes */}
      <p>Users: {formatNumber(1234.5)}</p>
      <p>Total: {formatCurrency(99.99, "USD")}</p>
      <p>Updated: {formatDate(new Date())}</p>
      <p>Posted: {formatRelativeTime(-2, "hour")}</p>
    </>
  );
}
```

With translation: `"items": "{count, plural, one {# item} other {# items}}"`, locale `"en"`, and `itemCount = 5`, renders: `"5 items"`.

## Type-safe translation keys

Declare translation keys once, get autocomplete and parameter validation everywhere:

```typescript
// src/types/i18n.d.ts
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string }; // name param required
    greeting: never; // no params
    items: { count: number };
    "errors:NOT_FOUND": never;
  }
}
```

```tsx
import { useI18n } from "@comvi/solid";

function App() {
  const { t } = useI18n();

  // ✓ Compiles — params shape matches the declaration
  return <h1>{t("welcome", { name: "Alice" })}</h1>;
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

Auto-generate these types from the Comvi platform via `@comvi/cli` or from local JSON with `@comvi/vite-plugin`.

## Loading translations from the Comvi platform

Pair with `@comvi/plugin-fetch-loader` to load translations from a CDN or API. No redeploy needed to ship a translation:

```tsx
import { createI18n, I18nProvider } from "@comvi/solid";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

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

export default function App() {
  return <I18nProvider i18n={i18n}>{/* ... */}</I18nProvider>;
}
```

See [`@comvi/plugin-fetch-loader`](https://github.com/comvi-io/comvi-js/tree/main/packages/plugin-fetch-loader) for full options and API endpoints.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
