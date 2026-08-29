<script lang="ts">
  // Everything here comes from `../src/index`, the ONE published surface. It
  // reports the loader bag so the test can assert a root-built host composes
  // and acquires a capability without the app ever naming `@comvi/core`.
  import { setI18nContext, useI18n, useI18nLoader } from "../src/index";
  import type { UseI18nLoaderReturn, WrapperI18nHost } from "../src/index";

  export let i18n: WrapperI18nHost;
  export let report: (bag: UseI18nLoaderReturn) => void = () => {};

  setI18nContext(i18n, { autoInit: false });

  const { t } = useI18n();
  report(useI18nLoader());
</script>

<div data-testid="greeting">{$t("greeting", { name: "Ada" })}</div>
