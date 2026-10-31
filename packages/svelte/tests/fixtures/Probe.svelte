<script lang="ts">
  import { useI18n } from "../../src";

  let { ns, k = "title", frames = [] }: Record<string, any> = $props();
  // svelte-ignore state_referenced_locally
  const r = useI18n(ns);
  $effect.pre(() => void frames.push(`${r.isReady}/${r.isLoading}`));
</script>

{#if r.isReady}<p>{r.t(k)}</p>{:else if r.isLoading}<i>loading</i>{:else}<b>unavailable</b>{/if}
