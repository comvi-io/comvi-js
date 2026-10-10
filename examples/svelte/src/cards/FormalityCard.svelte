<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  const registers = ['formal', 'informal'] as const;
  let formality = $state<(typeof registers)[number]>('formal');
  const { t } = useI18n();
</script>

<Card title={$t('demo.formality.title')} body={$t('demo.formality.body')}>
  <div class="segmented">
    {#each registers as option (option)}
      <button aria-pressed={formality === option} onclick={() => (formality = option)}
        >{$t(`demo.formality.${option}`)}</button
      >
    {/each}
  </div>
  <p class="widget" data-testid="formality-message">
    {$t('demo.formality.message', { formality })}
  </p>
</Card>
