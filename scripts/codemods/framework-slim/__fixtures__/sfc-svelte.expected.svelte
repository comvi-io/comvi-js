<!-- Language row — .svelte script block, extracted and remapped. -->
<script>
  import { useI18n, useI18nLoader } from "@comvi/svelte";

  const { t } = useI18n("panel");
  const { addActiveNamespace } = useI18nLoader();
</script>

<button on:click={() => addActiveNamespace("late")}>{t("load")}</button>
