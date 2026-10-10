<script lang="ts">
  import { useI18n, useI18nLoader } from '@comvi/svelte';
  import Card from '../components/Card.svelte';
  import { name } from '../name';
  import { link } from '../router';

  const { t, cacheRevision, getActiveNamespaces } = useI18n();
  // `useI18n('account')` only scopes `t` to the namespace; activating it is
  // what downloads it, and keeps it loaded across later locale switches.
  const { t: tAccount } = useI18n('account');
  const { addActiveNamespace } = useI18nLoader();

  // A failed load has already gone to `onError`; render either way.
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
  <Card title={$t('demo.navigation.title')}>
    <p class="widget" data-testid="about-body">{$t('about.body')}</p>
    <p class="widget"><a data-testid="nav-home" href="/" use:link>{$t('nav.home')}</a></p>
  </Card>

  <Card title={$t('demo.lazy.title')} body={$t('demo.lazy.body')}>
    {#if !ready}
      <p class="widget">{$t('app.loading')}</p>
    {:else}
      <p class="widget" data-testid="account-signed-in">{$tAccount('profile.signed_in', { name })}</p>
      <p class="widget" data-testid="account-devices">{$tAccount('profile.devices', { count: 3 })}</p>
      <!-- Only the English account catalog has this key, so every locale shows it in English. -->
      <p class="widget" data-testid="account-only-en">{$tAccount('profile.only_en')}</p>
      <p class="network"><span>{namespaces}</span></p>
    {/if}
  </Card>
</div>
