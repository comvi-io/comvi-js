<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';
  import { link } from '../router';

  const { t } = useI18n();
</script>

<Card title={$t('demo.navigation.title')} body={$t('demo.navigation.body')}>
  <p class="widget">
    <a data-testid="nav-about" href="/about" use:link>{$t('demo.navigation.cta')}</a>
  </p>
</Card>
