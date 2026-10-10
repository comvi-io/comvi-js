<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';
  import { locales } from '../i18n';

  const { t, cacheRevision, getLoadedLocales } = useI18n();

  // The `locale` call option reads another catalog without switching to it.
  // Only downloaded catalogs are listed: pick a language and it joins the list.
  const names = $derived.by(() => {
    void $cacheRevision;
    const loaded = getLoadedLocales();
    return locales
      .filter((code) => loaded.includes(code))
      .map((code) => ({
        code,
        text: $t('demo.options.inOwn', {
          name: $t('demo.options.name', { locale: code }),
          locale: code,
        }),
      }));
  });
</script>

<Card title={$t('demo.options.title')} body={$t('demo.options.body')}>
  <ul class="widget options">
    {#each names as item (item.code)}
      <li lang={item.code} dir="auto">{item.text}</li>
    {/each}
  </ul>
</Card>
