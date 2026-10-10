<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import { name } from '../name';
  import { link } from '../router';

  const { t } = useI18n();
</script>

<div class="start">
  <p class="widget">{$t('greeting.hello', { name: $name })}</p>
  <a class="cta" href="/features" use:link>{$t('demo.start.cta')}</a>
</div>
