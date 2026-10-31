<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';
  import { fetched } from '../i18n';

  // The list grows as you switch languages: each one is fetched the first time.
  const { t } = useI18n();
</script>

<Card title={t('demo.lazy.title')} body={t('demo.lazy.body')}>
  <p class="network">
    <span data-testid="fetched">{t('loader.fetched', { locales: $fetched.locales.join(', ') })}</span>
    <span>{t('demo.lazy.namespaces', { namespaces: $fetched.namespaces.join(', ') })}</span>
  </p>
</Card>
