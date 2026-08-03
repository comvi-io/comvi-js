<script lang="ts">
  // framework-slim DX pass probe: everything this component needs comes from
  // `@comvi/svelte/slim` — the SINGLE-PACKAGE surface. It reports the loader
  // bag so the test can assert a preset-built host composes and acquires a
  // capability without the app ever naming `@comvi/core`.
  import { setI18nContext, useI18n, useI18nLoader } from "../src/slim";
  import type { UseI18nLoaderReturn, WrapperI18nHost } from "../src/slim";

  export let i18n: WrapperI18nHost;
  export let report: (bag: UseI18nLoaderReturn) => void = () => {};

  setI18nContext(i18n, { autoInit: false });

  const { t } = useI18n();
  report(useI18nLoader());
</script>

<div data-testid="greeting">{$t("greeting", { name: "Ada" })}</div>
