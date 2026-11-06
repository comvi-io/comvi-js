<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import { locales } from '../i18n';

  // `locale` stays the current language until the new one's catalogs are in, so the
  // buttons never flicker. A failed switch is reported through onError and keeps it.
  const r = useI18n();
  const t = r.t;
</script>

<div class="switcher">
  <span class="eyebrow" id="language-label">{t('app.language')}</span>
  <div class="segmented" role="group" aria-labelledby="language-label">
    {#each locales as code (code)}
      <button data-testid="locale-{code}" aria-pressed={r.locale === code} onclick={() => r.setLocale(code).catch(() => {})}
        >{code.toUpperCase()}</button
      >
    {/each}
  </div>
  {#if r.isLoading}<span class="status">{t('app.loading')}</span>{/if}
</div>
<p class="note">{t('demo.rtl.body')}</p>
