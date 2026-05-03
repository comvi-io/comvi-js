<script lang="ts">
  import { getI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import T from "../src/T.svelte";

  const i18n = getI18nContext();
  const { t, locale, isInitialized } = useI18n();

  let contextLanguage: string;

  $: {
    void $locale;
    contextLanguage = i18n.locale;
  }
</script>

<div data-testid="context-language">{contextLanguage}</div>
<div data-testid="hook">{$t("hello")}-{$locale}</div>
<div data-testid="initialized">{$isInitialized ? "yes" : "no"}</div>
<div data-testid="component"><T i18nKey={"hello" as any} /></div>
