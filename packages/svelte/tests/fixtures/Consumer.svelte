<script lang="ts">
  import { T, useI18n } from "../../src";

  // Every way a Svelte server render reads the instance, on one page.
  const r: any = useI18n();
  const shop: any = useI18n("shop");
  const ShopT = shop.T;
  let { count = 2 }: { count?: number } = $props();
  const rest = $derived({ count });
</script>

<h1>{r.t("hi")}</h1>
<p id="bound"><ShopT i18nKey="items" {...rest} /></p>
<p id="void"><T i18nKey="lines" components={{ br: "br" }} /></p>
<p id="void2"><T i18nKey="lines2" components={{ br: "br" }} /></p>
<span>{r.locale}/{r.dir}/{shop.isReady}/{shop.isLoading}</span>
