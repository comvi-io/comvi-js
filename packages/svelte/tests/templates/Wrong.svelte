<!--
  Each line marked `error:` must get a svelte-check error, and no other line may
  (tests/templates/check.mjs).
-->
<script lang="ts">
  import { T, useI18n, type Children } from "../../src";
  const shop = useI18n("shop");
  const main = useI18n();
</script>

<T i18nKey="greeting" /><!-- error: a required param is missing -->
<T i18nKey="greeting" name={1} /><!-- error: a param of the wrong type -->
<T i18nKey="greting" name="Ann" /><!-- error: a key typo -->
<T i18nKey="cart.title" ns="shpo" count={1} /><!-- error: a namespace typo -->
<T i18nKey="cart.title" count={1} /><!-- error: a key of another namespace -->
<shop.T i18nKey="cart.title" /><!-- error: a required param is missing -->
<shop.T i18nKey="cart.title" count="1" /><!-- error: a param of the wrong type -->
<shop.T i18nKey="cart.titel" count={1} /><!-- error: a key typo -->
<shop.T i18nKey="cart.title" ns="shop" count={1} /><!-- error: the bound one takes no namespace -->
<shop.T i18nKey="greeting" name="Ann" /><!-- error: a key of another namespace -->
<T i18nKey="terms" link={(c: number) => c} /><!-- error: a handler that takes no text -->
<T i18nKey="terms" link={(c: string) => c.toUpperCase()} /><!-- error: a handler, <T> takes none -->
<T i18nKey="terms" link={(c) => `[${c}]`} /><!-- error: an inline handler, <T> takes none -->
<T i18nKey="terms" link={(c: Children) => c} /><!-- error: a Children handler, <T> takes none -->
<main.T i18nKey="terms" link={(c: string) => c} /><!-- error: the same on the bound one -->
<main.T i18nKey="terms" link={(c) => `[${c}]`} /><!-- error: an inline one on the bound one -->
<T i18nKey="terms">
  {#snippet link(children: number)}{children}{/snippet}<!-- error: a snippet that takes no text -->
</T>
<main.T i18nKey="terms">
  {#snippet link(children)}{children.toFixed()}{/snippet}<!-- error: an inferred snippet's children is text -->
</main.T>
