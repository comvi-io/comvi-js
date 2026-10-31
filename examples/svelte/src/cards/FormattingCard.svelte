<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import { useFormat } from '@comvi/svelte/format';
  import Card from '../components/Card.svelte';

  const RELEASED = new Date('2026-09-01T00:00:00Z');
  const { t } = useI18n();
  // Formatters in the language on screen: what calls them re-runs when it changes.
  const format = useFormat();
</script>

<Card title={t('demo.formatting.title')} body={t('demo.formatting.body')}>
  <p class="widget">
    {t('stats.summary', {
      views: format.number(1234567),
      date: format.date(RELEASED, { dateStyle: 'long', timeZone: 'UTC' }),
    })}
  </p>
  <p class="widget">{t('demo.formatting.price', { price: format.currency(1234.5, 'EUR') })}</p>
</Card>
