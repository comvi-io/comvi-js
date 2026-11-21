<script lang="ts">
  import { setI18n, T, type I18n } from "@comvi/svelte";
  import Inner from "./Inner.svelte";

  let { i18n }: { i18n: I18n } = $props();
  setI18n(i18n);
</script>

<p id="buy"><T i18nKey="buy" components={{ a: "a" }} /></p>
<p id="ab"><T i18nKey="ab" components={{ strong: "strong", em: "em" }} /></p>
<p id="nested"><T i18nKey="outer" components={{ u: "u", box: Inner }} /></p>
<p id="adjacent"><T i18nKey="buy" components={{ a: "a" }} /><T i18nKey="ab" components={{ strong: "strong", em: "em" }} /></p>
<p id="joined"><T i18nKey="joined" /></p>
