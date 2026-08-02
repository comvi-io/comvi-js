<!-- Language row — .svelte script block, extracted and remapped. -->
<script>
  import { useI18n } from "@comvi/svelte";

  const { t, addActiveNamespace } = useI18n("panel");
</script>

<button on:click={() => addActiveNamespace("late")}>{t("load")}</button>
