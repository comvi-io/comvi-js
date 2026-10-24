<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/svelte</h1>

<p align="center">Svelte 5 bindings for Comvi i18n: context, stores, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/svelte"><img src="https://img.shields.io/npm/v/@comvi/svelte?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=@comvi/svelte&amp;treeshake=%5B%7BcreateI18n%2CsetI18nContext%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22svelte%22%5D%7D%7D"><img src="https://deno.bundlejs.com/badge?q=@comvi/svelte&amp;treeshake=%5B%7BcreateI18n%2CsetI18nContext%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22svelte%22%5D%7D%7D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/svelte"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/svelte` puts the Comvi i18n instance on Svelte's context and hands your components `$t`
and `$locale` as stores, plus `<T>` for translations that contain markup. It targets Svelte 5; the
package depends on `@comvi/core`, so one install is enough.

## Install

```bash
npm install @comvi/svelte
# Peer: svelte ^5.3.0
```

## Setup

In the root layout, `src/routes/+layout.svelte`:

```svelte title="src/routes/+layout.svelte" check=group=svelte-2
<script lang="ts">
  import { createI18n, setI18nContext } from '@comvi/svelte';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  const i18n = createI18n({
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
      en: { greeting: 'Hello, {name}!' },
      uk: { greeting: 'Привіт, {name}!' },
    },
  });

  setI18nContext(i18n);
</script>

{@render children()}
```

`createI18n` returns the i18n instance and `setI18nContext` puts it where `useI18n()` finds it. It also calls
`init()` in a microtask, so there is no `init()` call to write; pass `{ autoInit: false }` to run it
yourself, and `{ onError }` to see a failed auto-init. In a plain Vite app the same code goes in
`src/App.svelte`.

## Use in components

In a page, `src/routes/+page.svelte`:

```svelte title="src/routes/+page.svelte" check=group=svelte-2
<script lang="ts">
  import { useI18n } from '@comvi/svelte';

  const { t, locale, setLocale } = useI18n();
</script>

<h1>{$t('greeting', { name: 'Alice' })}</h1>
<select value={$locale} onchange={(e) => setLocale(e.currentTarget.value)}>
  <option value="en">English</option>
  <option value="uk">Українська</option>
</select>
```

`useI18n()` returns stores, so `$`-prefix them in markup: `$t` renders a string, `$tRaw` a
string or, when the translation carries tags, a parts array. `setLocale()` is a plain function
that resolves once the new locale's catalog has loaded.

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

Compose the loader on the instance, in `src/routes/+layout.svelte`:

```svelte title="src/routes/+layout.svelte" check=group=svelte-cdn
<script lang="ts">
  import { createI18n, setI18nContext } from '@comvi/svelte';
  import { cdnLoader } from '@comvi/plugin-fetch-loader';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  const i18n = createI18n({
    locale: 'en',
    fallbackLocale: 'en',
  }).use(cdnLoader({ cdnUrl: 'https://cdn.comvi.io/<project-token>' }));

  setI18nContext(i18n);
</script>

{@render children()}
```

Read `isInitializing` in the page, in `src/routes/+page.svelte`:

```svelte title="src/routes/+page.svelte" check=group=svelte-cdn
<script lang="ts">
  import { useI18n } from '@comvi/svelte';

  const { isInitializing, t } = useI18n();
</script>

{#if $isInitializing}
  <div class="spinner"></div>
{:else}
  <h1>{$t('greeting', { name: 'Alice' })}</h1>
{/if}
```

Compose `.use(cdnLoader({ cdnUrl }))` inside the `createI18n` expression, because `setI18nContext` calls
`init()` for you. With a catalog in flight during the first paint, `$isInitializing` is the gate:
there is no provider component and no `fallback` prop. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

## Specific to Svelte

- Everything reactive is a store: `$t`, `$tRaw`, `$locale`, `$isLoading`, `$isInitializing`, `$dir`.
  `$t` inside a `$derived` re-runs when the locale or the catalog changes.
- `formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` are plain functions, not
  stores, and still follow the locale in markup and `$derived`. A trailing `locale` argument
  overrides it.
- `<T components={{ link: 'a', policy: { tag: 'a', props: { href: '/privacy' } } }} />`: each tag
  maps to an element name, a `{ tag, props }` config, or a Svelte component that receives the tag's
  content as its `children` snippet. `<T>` builds real DOM nodes, never an HTML string.
- `@comvi/svelte` ships no SvelteKit adapter and needs none. Build a fresh instance per request and
  never mutate a module-level singleton on the server. The root layout's `load` returns plain
  data, `{ locale, messages }`, never the instance. `+layout.svelte` builds the instance once from
  that payload, inside `untrack()`, and passes every later `data` to it in an `$effect.pre`
  (`addMessages()`, then `setLocale()`); without that, a link to another locale changes the URL and
  keeps the old text.
- `<svelte:head>` cannot set attributes on `<html>`. Replace `%lang%` in `src/app.html` from a
  `handle` hook for the server render, with the locale checked against your list first, and set `lang` and `dir` from `$locale` and `$dir` in an
  `$effect` for client navigation.

## Read next

- [Svelte guide](https://comvi.io/docs/i18n/svelte): rich text, gating the first paint, SSR.
- [Svelte API reference](https://comvi.io/docs/i18n/api/svelte): every export, the standalone stores and `<T>` props.
- [SvelteKit SSR](https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart): the server `load`, the layout and a page.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `$t` autocompletes.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
