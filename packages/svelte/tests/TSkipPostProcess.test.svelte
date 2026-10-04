<script lang="ts">
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;
  export let i18nKey: string;
  // `undefined` means "the prop was not passed at all" (distinct from
  // explicit `false`), matching `TPropForwarding.test.svelte`'s pass*/value
  // split for the reserved props.
  export let skipPostProcess: boolean | undefined = undefined;

  $: forwarded = {
    ...(skipPostProcess === undefined ? {} : { skipPostProcess }),
  };

  setI18nContext(i18n);
</script>

<div data-testid="t-skip-post-process">
  <T {i18nKey} {...forwarded} />
</div>
