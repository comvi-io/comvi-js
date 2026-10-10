<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';
  import { name } from '../name';

  const { t } = useI18n();
</script>

<Card title={$t('demo.interpolation.title')} body={$t('demo.interpolation.body')}>
  <label class="field">
    <span>{$t('demo.interpolation.label')}</span>
    <input data-testid="name-input" bind:value={$name} />
  </label>
  <p class="widget" data-testid="greeting">{$t('greeting.hello', { name: $name })}</p>
</Card>
