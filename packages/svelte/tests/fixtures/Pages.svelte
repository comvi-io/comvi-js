<script lang="ts">
  import Probe from "./Probe.svelte";

  // Consumers on screen by namespace; `set` lets the test change them.
  let { initial, api }: { initial: string[]; api: { set?: (v: string[]) => void } } = $props();
  // svelte-ignore state_referenced_locally
  let shown = $state.raw(initial);
  // svelte-ignore state_referenced_locally
  api.set = (v) => (shown = v);
</script>

{#each shown as ns, n (ns + n)}<Probe {ns} />{/each}
