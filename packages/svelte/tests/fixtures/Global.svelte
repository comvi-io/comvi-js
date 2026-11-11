<script lang="ts">
  import { useI18n } from "../../src";

  let { frames = [], out = {} }: Record<string, any> = $props();
  // A re-render that reads the flags again, with no new state of the instance.
  let bump = $state(0);
  // svelte-ignore state_referenced_locally
  out.bump = () => bump++;
  // `useI18n()` with no argument: its flags read the configured namespaces.
  const r = useI18n();
  $effect.pre(() => void frames.push(`${r.isReady}/${r.isLoading}`));
</script>

{#if r.isReady}<p>{r.t("hi")}</p>{:else if r.isLoading}<i>…</i>{:else}<b>unavailable</b>{/if}<s
  >{bump}</s
>
