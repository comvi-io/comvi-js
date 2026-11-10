<script lang="ts">
  import { setI18n } from "../../src";
  import Global from "./Global.svelte";

  let { i18n }: Record<string, any> = $props();
  // svelte-ignore state_referenced_locally
  setI18n(i18n);
</script>

<Global />
