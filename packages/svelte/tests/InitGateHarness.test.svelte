<script lang="ts">
  // The documented first-render gate: `setI18nContext` starts `init()`, and
  // `$isInitializing` hides the tree until the first catalog is in.
  import { setI18nContext } from "../src/context";
  import type { SetI18nContextOptions } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;
  export let options: SetI18nContextOptions | undefined = undefined;

  setI18nContext(i18n, options);
  const { t, isInitializing } = useI18n();
</script>

{#if $isInitializing}
  <p data-testid="gate">Loading…</p>
{:else}
  <p data-testid="text">{$t("greeting")}</p>
{/if}
