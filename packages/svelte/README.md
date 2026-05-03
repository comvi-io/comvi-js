<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/svelte</h1>

<p align="center">Svelte 4 / 5 binding for Comvi i18n — stores, context, and <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/svelte"><img src="https://img.shields.io/npm/v/@comvi/svelte?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=%40comvi%2Fsvelte"><img src="https://deno.bundlejs.com/?q=@comvi/svelte&badge=&badge-style=flat&badge-raster" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/svelte` wraps [`@comvi/core`](../core) for Svelte. `setI18nContext()` registers the instance for descendants; `useI18n()` returns reactive stores that work with `$store` syntax in both Svelte 4 and Svelte 5.

Same `t()` and `<T>` API as the [Vue](../vue), [React](../react), and [SolidJS](../solid) bindings — switch frameworks without relearning your i18n layer.

📖 **Documentation:** https://comvi.io/docs/i18n/svelte/

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~8 kB gzipped, zero runtime dependencies.** No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.

## Why @comvi/svelte?

- **Native stores with `$` syntax.** `useI18n()` returns proper Svelte stores — `$locale`, `$isLoading`, `$t()` work seamlessly with auto-subscription in templates.
- **Single context setup.** Call `setI18nContext()` once in a parent component; descendants automatically access stores via `useI18n()` without prop drilling.
- **Both Svelte 4 & 5.** Built with Svelte 5's rune-compatible API while remaining fully compatible with Svelte 4 projects.

## Install

```bash
npm install @comvi/svelte
# Peer: svelte ^4.0.0 || ^5.0.0
```

## Quick start

```svelte
<!-- src/routes/+layout.svelte (or App.svelte) -->
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";

  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    translation: {
      en: { greeting: "Hello, {name}!" },
      uk: { greeting: "Привіт, {name}!" },
    },
  });

  setI18nContext(i18n);
</script>

<slot />
```

```svelte
<!-- A child component -->
<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  const { t, locale, setLocale } = useI18n();
</script>

<h1>{$t("greeting", { name: "Alice" })}</h1>
<select value={$locale} on:change={(e) => setLocale(e.currentTarget.value)}>
  <option value="en">English</option>
  <option value="uk">Українська</option>
</select>
```

For strict typed key overloads in Svelte, use `tRaw` from `useI18n()`. The `$t` store is a string-key convenience wrapper for template ergonomics.

For `<T>` rich-text components, type-safe keys, and the full store API, see the [documentation](https://comvi.io/docs/i18n/svelte/).

## Rich text with `<T>`

Tag interpolation lets translators write readable markup like `"Click <link>here</link> for help"` without raw HTML or XSS risk. Map tags to standard HTML elements or custom attributes:

```json
{
  "help": "For support, <link>visit our docs</link> or <bold>email us</bold>.",
  "legal": "See our <policy>privacy policy</policy>."
}
```

```svelte
<script lang="ts">
  import { T } from "@comvi/svelte";
</script>

<T
  i18nKey="help"
  components={{
    link: "a",    // Map to standard HTML tag
    bold: "strong",
    policy: { tag: "a", props: { href: "/privacy" } },
  }}
/>

<!-- Renders: "For support, <a>visit our docs</a> or <strong>email us</strong>." -->
<!-- policy becomes: <a href="/privacy">See our privacy policy</a> -->
```

The `<T>` component escapes text and filters rendered tags/attributes before using Svelte's HTML rendering path. Props can inject attributes; translators see only the text.

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

```svelte
<script lang="ts">
  import { useI18n } from "@comvi/svelte";

  const { t, locale, setLocale, formatNumber, formatDate, formatCurrency, formatRelativeTime } = useI18n();
  let itemCount = 5;
</script>

<!-- Plurals automatically match locale -->
<p>{$t("items", { count: itemCount })}</p>

<!-- Locale-aware formatting — automatically updates when locale changes -->
<p>Users: {formatNumber(1234.5)}</p>
<p>Total: {formatCurrency(99.99, "USD")}</p>
<p>Updated: {formatDate(new Date())}</p>
<p>Posted: {formatRelativeTime(-2, "hour")}</p>

<select value={$locale} on:change={(e) => setLocale(e.currentTarget.value)}>
  <option value="en">English</option>
  <option value="uk">Українська</option>
</select>
```

With translation: `"items": "{count, plural, one {# item} other {# items}}"` and `itemCount = 5`, renders: `"5 items"`.

## Type-safe translation keys

Declare translation keys once to type the core API and framework bindings. In Svelte, `tRaw` keeps the typed overloads from core; `$t` is the string convenience store and accepts string keys.

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

```svelte
<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  const { tRaw } = useI18n();

  // ✓ Compiles — params shape matches the declaration
  const welcome = $tRaw("welcome", { name: "Alice" });
</script>

<h1>{welcome}</h1>
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
$tRaw("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
$tRaw("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
$tRaw("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
$tRaw("typo", { name: "Alice" });
```

Auto-generate these types from the Comvi platform via `@comvi/cli` or from local JSON with `@comvi/vite-plugin`.

## Loading translations from the Comvi platform

Pair with `@comvi/plugin-fetch-loader` to load translations from a CDN or API. No redeploy needed to ship a translation:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import { FetchLoader } from "@comvi/plugin-fetch-loader";

  const i18n = createI18n({ locale: "en" });

  // CDN for production, API for dev/staging
  i18n.use(FetchLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id",
  }));

  setI18nContext(i18n);
</script>

<slot />
```

See [`@comvi/plugin-fetch-loader`](https://github.com/comvi-io/comvi-js/tree/main/packages/plugin-fetch-loader) for full options and API endpoints.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
