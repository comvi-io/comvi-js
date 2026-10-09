<script lang="ts">
  // Runes, unlike this package's other harnesses: `$state` is what makes the
  // direct prop change after mount, which is the whole subject of the case.
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";
  import type { WrapperI18nInstance } from "@comvi/core";

  let { i18n }: { i18n: WrapperI18nInstance } = $props();

  let name = $state("Ada");

  // The host is fixed for the component's lifetime — the same one-time read the
  // package's other harnesses do with `export let`.
  // svelte-ignore state_referenced_locally
  setI18nContext(i18n);
</script>

<button data-testid="rename" onclick={() => (name = "Bo")}>rename</button>
<div data-testid="t-reactive"><T i18nKey="greet" {name} /></div>
