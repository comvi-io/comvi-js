<script lang="ts">
  import { setI18nContext } from "../src/context";
  import type { WrapperI18nHost } from "@comvi/core";

  // `onError` is passed through as given, so `undefined` is the
  // no-handler case rather than a different call shape.
  export let i18n: WrapperI18nHost;
  export let onError: ((error: Error) => void) | undefined = undefined;

  setI18nContext(i18n, { onError });
</script>

<div data-testid="mounted">mounted</div>
