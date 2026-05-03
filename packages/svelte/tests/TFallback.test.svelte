<script lang="ts">
  import { setI18nContext } from '../src/context';
  import T from '../src/T.svelte';

  export let i18n: any;
  export let i18nKey: string;
  export let fallbackProp: string | undefined = undefined;
  export let useSlot: boolean = false;

  setI18nContext(i18n);
</script>

<div data-testid="t-wrapper">
  {#if useSlot}
    {#if fallbackProp !== undefined}
      <T {i18nKey} fallback={fallbackProp}>
        <span>Slot fallback</span>
      </T>
    {:else}
      <T {i18nKey}>
        <span>Slot fallback</span>
      </T>
    {/if}
  {:else}
    {#if fallbackProp !== undefined}
      <T {i18nKey} fallback={fallbackProp} />
    {:else}
      <T {i18nKey} />
    {/if}
  {/if}
</div>
