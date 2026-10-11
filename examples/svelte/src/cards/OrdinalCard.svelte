<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  let { count }: { count: number } = $props();
  const { t } = useI18n();
</script>

<Card title={$t('demo.ordinal.title')} body={$t('demo.ordinal.body')}>
  <p class="widget" data-testid="ordinal">{$t('demo.ordinal.message', { n: count })}</p>
</Card>
