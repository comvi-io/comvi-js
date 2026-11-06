<script lang="ts">
  import { T, useI18n } from "../../src";
  import Formal from "./Formal.svelte";

  // The rich examples of the probe (link, component with props, nested, <br/>, a snippet), on a
  // server render and its hydration: `components` and snippets only.
  const { T: B }: any = useI18n();
  const link = { component: "a", props: { href: "/terms" } };
</script>

<p id="link"><T i18nKey="link" components={{ link }} /></p>
<p id="props"><T i18nKey="props" components={{ b: { component: Formal, props: { tone: "loud" } } }} /></p>
<p id="nested"><T i18nKey="nested" components={{ b: "strong", i: Formal }} /></p>
<p id="br"><T i18nKey="br" components={{ br: "br" }} /></p>
<p id="snippet"><B i18nKey="home">{#snippet home(children: string)}<a href="/">{children}</a>{/snippet}</B></p>
