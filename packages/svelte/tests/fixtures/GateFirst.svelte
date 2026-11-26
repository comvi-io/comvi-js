<script lang="ts">
  import { useI18n } from "../../src";

  // The boolean-first gate: a skeleton while loading, else the title; `log` records what it
  // shows on every update of the state.
  let { log }: { log: string[] } = $props();
  const r = useI18n();
  $effect.pre(() => void log.push(r.isLoading ? "skeleton" : `title:${r.t("title")}`));
</script>

{#if r.isLoading}<i data-testid="skeleton"></i>{:else}<h1 data-testid="title">{r.t("title")}</h1>{/if}
