<script lang="ts">
  import { setI18nContext, useI18n } from '@comvi/svelte';
  import LocaleSwitcher from './components/LocaleSwitcher.svelte';
  import Home from './pages/Home.svelte';
  import Account from './pages/Account.svelte';
  import { i18n } from './i18n';
  import { pathname } from './router';

  // Makes the instance available to every component below and starts loading
  // the first catalog.
  setI18nContext(i18n);

  const { t, locale, dir, isInitializing } = useI18n();

  $effect(() => {
    document.documentElement.lang = $locale;
    document.documentElement.dir = $dir;
  });
</script>

{#if $isInitializing}
  <main><p class="status">Loading…</p></main>
{:else}
  <main>
    <header>
      <h1>{$t('app.title')}</h1>
      <p class="intro">{$t('demo.intro')}</p>
      <LocaleSwitcher />
    </header>

    {#if $pathname === '/about'}
      <Account />
    {:else}
      <Home />
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
