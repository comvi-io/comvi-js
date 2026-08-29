<script lang="ts">
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;
  export let i18nKey: string;
  export let fallbackProp: string | undefined = undefined;
  export let useSlot: boolean = false;

  $: forwarded = fallbackProp === undefined ? {} : { fallback: fallbackProp };

  setI18nContext(i18n);
</script>

<div data-testid="t-wrapper">
  {#if useSlot}
    <T {i18nKey} {...forwarded}>
      <span>Slot fallback</span>
    </T>
  {:else}
    <T {i18nKey} {...forwarded} />
  {/if}
</div>
