<script lang="ts">
  import { useI18n } from "../../src";

  // The bound <T> with a rest-spread param that changes: the param must stay reactive.
  let { ns = "default", start = 1, api = {} }: Record<string, any> = $props();
  // svelte-ignore state_referenced_locally
  const { T: B }: any = useI18n(ns);
  // svelte-ignore state_referenced_locally
  let count = $state(start);
  api.set = (v: number) => (count = v);
  const rest = $derived({ count });
</script>

<B i18nKey="items" {...rest} />
