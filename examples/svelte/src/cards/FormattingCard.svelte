<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  const RELEASED = new Date('2026-09-01T00:00:00Z');
  const { t, formatNumber, formatDate } = useI18n();

  // The formatters read the current locale when called; reading `$t` makes
  // these recompute when it changes.
  const summary = $derived(
    $t('stats.summary', {
      views: formatNumber(1234567),
      date: formatDate(RELEASED, { dateStyle: 'long' }),
    }),
  );
  const price = $derived(
    $t('demo.formatting.price', {
      price: formatNumber(1234.5, { style: 'currency', currency: 'EUR' }),
    }),
  );
</script>

<Card title={$t('demo.formatting.title')} body={$t('demo.formatting.body')}>
  <p class="widget">{summary}</p>
  <p class="widget">{price}</p>
</Card>
