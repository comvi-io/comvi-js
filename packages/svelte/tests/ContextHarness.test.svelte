<script lang="ts">
  import { setI18nContext } from "../src/context";
  import ContextConsumer from "./ContextConsumer.test.svelte";

  export let i18n: any;
  export let autoInit: boolean | undefined = undefined;

  if (autoInit === undefined) {
    setI18nContext(i18n);
  } else {
    setI18nContext(i18n, { autoInit });
  }
</script>

<ContextConsumer />
