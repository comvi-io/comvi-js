<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import { locales } from '../i18n';
  import LoadError from './LoadError.svelte';

  // `locale` stays the current language until the new one's catalogs are in, so the
  // buttons never flicker.
  const r = useI18n();
  const t = r.t;

  // The locale whose switch failed, if any: its catalog could not be loaded.
  let failed = $state<string | null>(null);

  // A failed switch keeps the current language on screen, reports the error through
  // onError and resolves with it; calling setLocale() again asks the loader again. A
  // switch a later click overtook resolves with nothing.
  async function switchTo(code: string) {
    failed = null;
    const failure = await r.setLocale(code);
    if (failure !== undefined) failed = code;
  }
</script>

<div class="switcher">
  <span class="eyebrow" id="language-label">{t('app.language')}</span>
  <div class="segmented" role="group" aria-labelledby="language-label">
    {#each locales as code (code)}
      <button data-testid="locale-{code}" aria-pressed={r.locale === code} onclick={() => switchTo(code)}
        >{code.toUpperCase()}</button
      >
    {/each}
  </div>
  {#if r.isFetching}<span class="status">{t('app.loading')}</span>{/if}
</div>
{#if failed}{@const code = failed}<LoadError onretry={() => switchTo(code)} />{/if}
<p class="note">{t('demo.rtl.body')}</p>
