<!-- Correct uses: svelte-check reports nothing here. -->
<script lang="ts">
  import { T, useI18n } from "../../src";
  const shop = useI18n("shop");
  const main = useI18n();
</script>

<T i18nKey="greeting" name="Ann" />
<T i18nKey="title" />
<T i18nKey="items" count={2} locale="de" markers={false} />
<T i18nKey="terms" components={{ link: "a" }} />
<T i18nKey="terms" components={{ link: { component: "a", props: { href: "/terms" } } }} />
<T i18nKey="terms" link={terms} />
<T i18nKey="terms">
  {#snippet link(children: string)}<a href="/terms">{children}</a>{/snippet}
</T>
<T i18nKey="cart.title" ns="shop" count={1} />
<shop.T i18nKey="cart.title" count={1} />
<main.T i18nKey="terms">
  {#snippet link(children)}<a href="/terms">{children.toUpperCase()}</a>{/snippet}
</main.T>

{#snippet terms(children: string)}<a href="/terms">{children}</a>{/snippet}
