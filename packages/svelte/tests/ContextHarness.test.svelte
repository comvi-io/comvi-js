<script lang="ts">
  import { setI18nContext } from "../src/context";
  import ContextConsumer from "./ContextConsumer.test.svelte";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;
  export let autoInit: boolean | undefined = undefined;

  if (autoInit === undefined) {
    setI18nContext(i18n);
  } else {
    setI18nContext(i18n, { autoInit });
  }
</script>

<ContextConsumer />
