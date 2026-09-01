<script lang="ts">
  import { setI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;

  setI18nContext(i18n, { autoInit: false });

  const { getTranslationCache } = useI18n();

  const cache = getTranslationCache();
  const cacheKeys = [...cache.keys()].sort().join(",");
  const englishGreeting = String(cache.get("en:common")?.hello);
</script>

<div data-testid="cache-keys">{cacheKeys}</div>
<div data-testid="cache-en-hello">{englishGreeting}</div>
