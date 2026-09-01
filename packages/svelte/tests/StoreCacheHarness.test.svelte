<script lang="ts">
  import { setI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;

  setI18nContext(i18n, { autoInit: false });

  const first = useI18n();
  const second = useI18n();

  const { t: adminT, tRaw: adminTRaw } = useI18n("admin");
  const { t: billingT, tRaw: billingTRaw } = useI18n("billing");
</script>

<div data-testid="t-stable">{String(first.t === second.t)}</div>
<div data-testid="traw-stable">{String(first.tRaw === second.tRaw)}</div>

<div data-testid="admin-title">{$adminT("title")}</div>
<div data-testid="billing-title">{$billingT("title")}</div>
<div data-testid="admin-title-raw">{String($adminTRaw("title"))}</div>
<div data-testid="billing-title-raw">{String($billingTRaw("title"))}</div>
