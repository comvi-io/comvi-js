<script lang="ts">
  import { useI18n, useI18nLoader } from '@comvi/svelte';
  import { link } from './router';

  let { name }: { name: string } = $props();

  // A second namespace, loaded the first time this page is shown.
  // `useI18n('account')` scopes `$t` to the `account` namespace and loads
  // nothing. `addActiveNamespace('account')` is what fetches it for the current
  // locale, and it keeps the namespace active, so a later locale switch brings
  // `account` along with the default namespace before the new locale applies.
  const { t: tAccount } = useI18n('account');
  const { t, cacheRevision, getActiveNamespaces } = useI18n();
  const { addActiveNamespace } = useI18nLoader();

  // Until the namespace is in, its keys would render as themselves, so the rows
  // wait for the activation to settle. Settle, not succeed: a load that failed
  // has already reached `onError`, and the keys then show as they would for any
  // missing translation.
  let ready = $state(false);
  const done = () => (ready = true);
  addActiveNamespace('account').then(done, done);

  const namespaces = $derived.by(() => {
    void $cacheRevision;
    void ready;
    return $t('demo.lazy.namespaces', { namespaces: getActiveNamespaces().join(', ') });
  });
</script>

<div class="cards">
  <section class="card">
    <h2 class="eyebrow">{$t('demo.navigation.title')}</h2>
    <p class="widget" data-testid="about-body">{$t('about.body')}</p>
    <p class="widget"><a data-testid="nav-home" href="/" use:link>{$t('nav.home')}</a></p>
  </section>

  <section class="card">
    <h2 class="eyebrow">{$t('demo.lazy.title')}</h2>
    <p class="card-body">{$t('demo.lazy.body')}</p>
    {#if !ready}
      <p class="widget">{$t('app.loading')}</p>
    {:else}
      <p class="widget" data-testid="account-signed-in">
        {$tAccount('profile.signed_in', { name })}
      </p>
      <p class="widget" data-testid="account-devices">{$tAccount('profile.devices', { count: 3 })}</p>
      <!--
        Only `account/en.json` has this key: the fallback chain is walked inside
        the same namespace, once that namespace's en catalog is in.
      -->
      <p class="widget" data-testid="account-only-en">{$tAccount('profile.only_en')}</p>
      <p class="network"><span>{namespaces}</span></p>
    {/if}
  </section>
</div>
