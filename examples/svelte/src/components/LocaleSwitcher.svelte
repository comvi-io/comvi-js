<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import { locales } from '../i18n';

  const { t, locale, setLocale, isLoading } = useI18n();
</script>

<div class="switcher">
  <span class="eyebrow" id="language-label">{$t('app.language')}</span>
  <div class="segmented" role="group" aria-labelledby="language-label">
    {#each locales as code (code)}
      <button data-testid="locale-{code}" aria-pressed={$locale === code} onclick={() => setLocale(code)}
        >{code.toUpperCase()}</button
      >
    {/each}
  </div>
  {#if $isLoading}<span class="status">{$t('app.loading')}</span>{/if}
</div>
<p class="note">{$t('demo.rtl.body')}</p>
