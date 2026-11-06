<script lang="ts">
  import { useFormat } from "../../src/format.svelte";

  let { run }: { run: (f: ReturnType<typeof useFormat>) => unknown } = $props();
  const f = useFormat();
</script>

<p>{run(f)}</p>
