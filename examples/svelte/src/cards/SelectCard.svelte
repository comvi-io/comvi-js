<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  const genders = ['female', 'male', 'other'] as const;
  let gender = $state<(typeof genders)[number]>('female');
  const { t } = useI18n();
</script>

<Card title={$t('demo.select.title')} body={$t('demo.select.body')}>
  <div class="segmented">
    {#each genders as option (option)}
      <button aria-pressed={gender === option} onclick={() => (gender = option)}
        >{$t(`demo.select.${option}`)}</button
      >
    {/each}
  </div>
  <p class="widget" data-testid="select-message">{$t('demo.select.message', { gender })}</p>
</Card>
