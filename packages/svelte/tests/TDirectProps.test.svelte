<script lang="ts">
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";
  import type { WrapperI18nHost } from "@comvi/core";

  // `direct` is spread so a test decides which non-declared props reach <T>;
  // an empty object is the "no direct props" case.
  export let i18n: WrapperI18nHost;
  export let i18nKey: string;
  export let params: Record<string, unknown> = {};
  export let direct: Record<string, unknown> = {};

  setI18nContext(i18n);
</script>

<div data-testid="t-direct-props">
  <T {i18nKey} {params} {...direct} />
</div>
