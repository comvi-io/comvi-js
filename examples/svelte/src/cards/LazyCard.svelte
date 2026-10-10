<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  const { t, cacheRevision, getLoadedLocales, getActiveNamespaces } = useI18n();

  // Both getters are plain calls; `$cacheRevision` ticks when a catalog lands.
  const fetched = $derived.by(() => {
    void $cacheRevision;
    return $t('loader.fetched', { locales: getLoadedLocales().join(', ') });
  });
  const namespaces = $derived.by(() => {
    void $cacheRevision;
    return $t('demo.lazy.namespaces', { namespaces: getActiveNamespaces().join(', ') });
  });
</script>

<Card title={$t('demo.lazy.title')} body={$t('demo.lazy.body')}>
  <p class="network">
    <span data-testid="fetched">{fetched}</span>
    <span>{namespaces}</span>
  </p>
</Card>
