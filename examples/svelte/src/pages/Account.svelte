<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';
  import { name } from '../name';
  import { link } from '../router';
  import { fetched } from '../i18n';


  const { t } = useI18n();
  // Loads the namespace and keeps it loaded across language switches while this
  // page shows; once the page closes it stays cached and a switch skips it.
  const account = useI18n('account');
  const tAccount = account.t;
</script>

<div class="cards">
  <Card title={t('demo.navigation.title')}>
    <p class="widget" data-testid="about-body">{t('about.body')}</p>
    <p class="widget"><a data-testid="nav-home" href="/features" use:link>{t('nav.home')}</a></p>
  </Card>

  <Card title={t('demo.lazy.title')} body={t('demo.lazy.body')}>
    {#if !account.isReady && account.isLoading}
      <p class="widget">{t('app.loading')}</p>
    {:else}
      <p class="widget" data-testid="account-signed-in">{tAccount('profile.signed_in', { name: $name })}</p>
      <p class="widget" data-testid="account-devices">{tAccount('profile.devices', { count: 3 })}</p>
      <!-- Only the English account catalog has this key, so every locale shows it in English. -->
      <p class="widget" data-testid="account-only-en">{tAccount('profile.only_en')}</p>
      <p class="network"><span>{t('demo.lazy.namespaces', { namespaces: $fetched.namespaces.join(', ') })}</span></p>
    {/if}
  </Card>
</div>
