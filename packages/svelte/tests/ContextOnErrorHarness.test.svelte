<script lang="ts">
  import { setI18nContext } from "../src/context";
  import type { WrapperI18nHost } from "@comvi/core";

  // `onError` is passed through as given, so `undefined` is the
  // no-handler case rather than a different call shape.
  export let i18n: WrapperI18nHost;
  export let onError: ((error: Error) => void) | undefined = undefined;
  // `omitOptions` calls the one-argument form, which is a different call shape
  // from `{ onError: undefined }` — the subject of the no-options case.
  export let omitOptions: boolean = false;

  if (omitOptions) {
    setI18nContext(i18n);
  } else {
    setI18nContext(i18n, { onError });
  }
</script>

<div data-testid="mounted">mounted</div>
