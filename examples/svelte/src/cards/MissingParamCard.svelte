<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  const { t } = useI18n();
</script>

<Card title={$t('demo.missing.title')} body={$t('demo.missing.body')}>
  <p class="widget" data-testid="missing-param">{$t('greeting.hello', {})}</p>
</Card>
