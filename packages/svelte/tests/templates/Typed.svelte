<!-- Correct uses: svelte-check reports nothing here. -->
<script lang="ts">
  import { T, useI18n, type Children } from "../../src";
  const shop = useI18n("shop");
</script>

<T i18nKey="greeting" name="Ann" />
<T i18nKey="title" />
<T i18nKey="items" count={2} locale="de" markers={false} />
<T i18nKey="terms" components={{ link: "a" }} />
<T i18nKey="terms" link={(c) => `[${c}]`} />
<T i18nKey="terms" link={(c: Children) => `[${c}]`} />
<T i18nKey="terms">
  {#snippet link(children: string)}<a href="/terms">{children}</a>{/snippet}
</T>
<T i18nKey="cart.title" ns="shop" count={1} />
<shop.T i18nKey="cart.title" count={1} />
