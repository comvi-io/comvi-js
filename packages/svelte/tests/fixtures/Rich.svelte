<script lang="ts">
  import { T, useI18n } from "../../src";

  // A snippet of a tag's name beside whatever props the test passes, on either <T>.
  let { bound = false, seen = [], ...p }: Record<string, any> = $props();
  const { T: B } = useI18n();
  // svelte-ignore state_referenced_locally
  const C: any = bound ? B : T;
</script>

<C {...p}>
  {#snippet b(children: string)}{seen.push(children), ""}<mark>{children}</mark>{/snippet}
</C>
