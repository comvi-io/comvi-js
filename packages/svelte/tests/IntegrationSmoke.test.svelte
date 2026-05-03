<script lang="ts">
  import { setI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import T from "../src/T.svelte";

  export let i18n: any;

  setI18nContext(i18n);
  const { t, locale } = useI18n();
</script>

<div data-testid="hook">{$t("hello")}-{$locale}</div>
<div data-testid="component"><T i18nKey={"hello" as any} /></div>
