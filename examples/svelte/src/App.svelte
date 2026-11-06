<script lang="ts">
  import { setI18n, useI18n } from '@comvi/svelte';
  import LocaleSwitcher from './components/LocaleSwitcher.svelte';
  import Start from './pages/Start.svelte';
  import Features from './pages/Features.svelte';
  import Account from './pages/Account.svelte';
  import { i18n } from './i18n';
  import { route } from './router';

  // Makes the instance available to every component below.
  setI18n(i18n);

  // Read `locale` and `dir` through the object: they are getters over the live state.
  const r = useI18n();
  const t = r.t;

  $effect(() => {
    document.documentElement.lang = r.locale;
    document.documentElement.dir = r.dir;
  });
</script>

<main>
    <header>
      <h1>{t('app.title')}</h1>
      <p class="intro">{t($route === 'start' ? 'demo.start.intro' : 'demo.intro')}</p>
      <LocaleSwitcher />
    </header>

    {#if $route === 'start'}
      <Start />
    {:else if $route === 'features'}
      <Features />
    {:else}
      <Account />
    {/if}

    {#if $route !== 'start'}
      <footer>
        <a href="https://comvi.io/docs/i18n">{t('demo.footer.docs')}</a>
        <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/svelte"
          >{t('demo.footer.source')}</a
        >
        <span class="install">{t('demo.footer.install')} <code>npm i @comvi/svelte</code></span>
      </footer>
    {/if}
  </main>
