<script lang="ts">
  import { useI18n } from "../../src";

  // Skeleton while loading, the title when ready, else an "unavailable" node; `log` records what
  // it shows on every update of the state.
  let { log }: { log: string[] } = $props();
  const r = useI18n();
  $effect.pre(() =>
    void log.push(r.isLoading ? "skeleton" : r.isReady ? `title:${r.t("title")}` : "unavailable"),
  );
</script>

{#if r.isLoading}<i data-testid="skeleton"></i>{:else if r.isReady}<h1 data-testid="title">{r.t("title")}</h1>{:else}<b data-testid="unavailable"></b>{/if}
