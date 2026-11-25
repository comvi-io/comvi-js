<script lang="ts">
  import { useI18n } from '@comvi/svelte';

  // What a failed load shows: the problem, in the language on screen, and a way to ask again.
  let { onretry }: { onretry: () => void } = $props();

  const { t } = useI18n();
</script>

<p class="note" role="alert" data-testid="load-error">
  {t('app.load_failed')}
  <button type="button" data-testid="load-retry" onclick={onretry}>{t('app.retry')}</button>
</p>
