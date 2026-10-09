<script lang="ts">
  import { setI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import type { WrapperI18nInstance } from "@comvi/core";

  export let i18n: WrapperI18nInstance;

  setI18nContext(i18n, { autoInit: false });

  const { getMessagesCache } = useI18n();

  const cache = getMessagesCache();
  const cacheKeys = [...cache.keys()].sort().join(",");
  const englishGreeting = String(cache.get("en:common")?.hello);
</script>

<div data-testid="cache-keys">{cacheKeys}</div>
<div data-testid="cache-en-hello">{englishGreeting}</div>
