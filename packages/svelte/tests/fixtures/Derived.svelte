<script lang="ts">
  import { useI18n } from "../../src";

  // t() on a namespace with no catalog inside a $derived: a read path that published
  // synchronously would throw state_unsafe_mutation here (R4-17).
  let { ns }: { ns: string } = $props();
  const r: any = useI18n();
  const v = $derived(r.t("title", { ns }));
</script>

<p>{v}</p>
