<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';
  import { missingKeys } from '../i18n';

  const { t } = useI18n();
</script>

<Card title={$t('demo.errors.title')} body={$t('demo.errors.body')}>
  <p class="widget" data-testid="missing-count">{$t('demo.errors.count', { count: $missingKeys })}</p>
</Card>
