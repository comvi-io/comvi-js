<script lang="ts">
  import { setI18n, T, useI18n } from "@comvi/svelte";
  import type { I18n } from "@comvi/core";

  let { i18n }: { i18n: I18n } = $props();
  // svelte-ignore state_referenced_locally
  setI18n(i18n);
  const { t } = useI18n();
  let late = $state(false);
</script>

<section id="region-A">
  <h1 id="A-title">{t("home.title")}</h1>
  <p id="A-common">{t("save", { ns: "common" })}</p>
  <p id="A-missing">{t("missing.key")}</p>
  <p id="A-rich"><T i18nKey="rich.terms" components={{ b: "b" }} /></p>
  <button id="more" type="button" onclick={() => (late = true)}>More</button>
  {#if late}
    <p id="A-late">{t("nav.about")}</p>
  {/if}
</section>
