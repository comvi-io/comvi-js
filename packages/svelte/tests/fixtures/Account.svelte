<script lang="ts">
  import { useI18n } from "../../src";
  const r: any = useI18n("account");
</script>

{#if r.isReady}<p>{r.t("title")}</p>{:else if r.isLoading}<i>loading</i>{:else}<b>unavailable</b
  >{/if}
