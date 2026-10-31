<script lang="ts">
  import { setI18n } from "../../src";

  let { i18n, C, ...p }: Record<string, any> = $props();
  setI18n(i18n);
</script>

<C {...p} />
