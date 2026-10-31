<script lang="ts">
  import { setI18n } from "../../src";
  import Consumer from "./Consumer.svelte";

  let { i18n, count }: Record<string, any> = $props();
  // svelte-ignore state_referenced_locally
  setI18n(i18n);
</script>

<Consumer {count} />
