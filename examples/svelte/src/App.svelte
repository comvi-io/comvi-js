<script lang="ts">
  import { setI18nContext, useI18n } from '@comvi/svelte';
  import Home from './Home.svelte';
  import Account from './Account.svelte';
  import { i18n, locales, rtlLocale } from './i18n';
  import { pathname } from './router';

  // Publishes the instance to every descendant and — because `autoInit`
  // defaults to true — calls `i18n.init()`, which runs the plugins and loads
  // the first catalog.
  setI18nContext(i18n);

  // Everything reactive here is a STORE: `$`-prefix it at the call site.
  const { t, locale, dir, setLocale, isLoading, isInitializing } = useI18n();

  // The greeting's `{name}`: 'Ada', or `?name=…` from the address bar. Whatever
  // arrives there is a parameter, and a parameter is rendered as text, never as
  // markup: try `?name=<b>Grace</b>`.
  const name = new URLSearchParams(location.search).get('name') ?? 'Ada';

  // `$effect` — not a top-level statement: the document is only there to touch
  // after the component has mounted, and this re-runs whenever the locale moves.
  $effect(() => {
    document.documentElement.lang = $locale;
    document.documentElement.dir = $dir;
  });
</script>

<!-- `setI18nContext` starts `init()`; until the first catalog is in, show this
     rather than raw keys. -->
{#if $isInitializing}
  <main><p class="status">Loading…</p></main>
{:else}
  <main>
    <header>
      <h1>{$t('app.title')}</h1>
      <p class="intro">{$t('demo.intro')}</p>
      <div class="switcher">
        <span class="eyebrow" id="language-label">{$t('app.language')}</span>
        <div class="segmented" role="group" aria-labelledby="language-label">
          {#each locales as code (code)}
            <button
              data-testid="locale-{code}"
              aria-pressed={$locale === code}
              onclick={() => setLocale(code)}>{code.toUpperCase()}</button
            >
          {/each}
        </div>
        <!-- Not in the switcher: the right-to-left locale the e2e suite uses. -->
        <button hidden data-testid="locale-{rtlLocale}" onclick={() => setLocale(rtlLocale)}
          >{rtlLocale}</button
        >
        {#if $isLoading}<span class="status">{$t('app.loading')}</span>{/if}
      </div>
    </header>

    <!-- Two routes: `/` and `/about`. See ./router.ts. -->
    {#if $pathname === '/about'}
      <Account {name} />
    {:else}
      <Home {name} />
    {/if}

    <footer>
      <a href="https://comvi.io/docs/i18n">{$t('demo.footer.docs')}</a>
      <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/svelte"
        >{$t('demo.footer.source')}</a
      >
      <span class="install">{$t('demo.footer.install')} <code>npm i @comvi/svelte</code></span>
    </footer>
  </main>
{/if}
