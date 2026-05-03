<script lang="ts">
  import { setI18nContext } from "../src/context";
  import type { ComponentMap } from "../src/types";
  import T from "../src/T.svelte";

  export let i18n: any;
  export let i18nKey: string;
  export let params: Record<string, unknown> = {};
  export let components: ComponentMap = {};
  export let raw: boolean | undefined = undefined;

  setI18nContext(i18n);
</script>

<div data-testid="t-interpolation-wrapper">
  {#if raw === undefined}
    <T {i18nKey} {params} {components} />
  {:else}
    <T {i18nKey} {params} {components} {raw} />
  {/if}
</div>
