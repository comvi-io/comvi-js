<script lang="ts">
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";
  import type { WrapperI18nInstance } from "@comvi/core";

  export let i18n: WrapperI18nInstance;
  export let i18nKey: string;
  // `undefined` means "the prop was not passed at all" (distinct from
  // explicit `false`), matching `TPropForwarding.test.svelte`'s pass*/value
  // split for the reserved props.
  export let markers: boolean | undefined = undefined;

  $: forwarded = {
    ...(markers === undefined ? {} : { markers }),
  };

  setI18nContext(i18n);
</script>

<div data-testid="t-markers">
  <T {i18nKey} {...forwarded} />
</div>
