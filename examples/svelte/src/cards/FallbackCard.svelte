<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  const { t } = useI18n();
  // @ts-expect-error: no catalog has this key, so the generated types reject it
  const nowhere = () => t('fallback.nowhere');
</script>

<Card title={t('demo.fallback.title')} body={t('demo.fallback.body')}>
  <!-- The Ukrainian catalog lacks this key, so Ukrainian shows the English text. -->
  <p class="widget" data-testid="fallback">{t('fallback.only_en')}</p>
  <!-- No catalog has this key: it renders as its name. -->
  <p class="widget"><code data-testid="missing-key">{nowhere()}</code></p>
</Card>
