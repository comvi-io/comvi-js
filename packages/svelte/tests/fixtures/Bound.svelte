<script lang="ts">
  import { useI18n } from "../../src";

  const r = useI18n();
  const T = r.T;
</script>

<p>{r.t("k")}<T i18nKey="k" /></p>
