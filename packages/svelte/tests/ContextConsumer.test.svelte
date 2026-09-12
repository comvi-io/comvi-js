<script lang="ts">
  import { getI18nContext, useI18nHost } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import T from "../src/T.svelte";

  const i18n = useI18nHost();
  // The deprecated spelling reads the same context slot.
  const sameHost = getI18nContext() === i18n;
  const { t, locale, isInitialized } = useI18n();

  let contextLanguage: string;

  $: {
    void $locale;
    contextLanguage = i18n.locale;
  }
</script>

<div data-testid="context-language">{contextLanguage}</div>
<div data-testid="host-identity">{sameHost ? "same" : "different"}</div>
<div data-testid="hook">{$t("hello")}-{$locale}</div>
<div data-testid="initialized">{$isInitialized ? "yes" : "no"}</div>
<div data-testid="component"><T i18nKey={"hello" as any} /></div>
