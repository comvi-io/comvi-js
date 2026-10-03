<script lang="ts">
  import { setI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import type { WrapperI18nHost } from "@comvi/core";

  let { i18n }: { i18n: WrapperI18nHost } = $props();

  // The host is fixed for the component's lifetime.
  // svelte-ignore state_referenced_locally
  setI18nContext(i18n, { autoInit: false });

  const { formatNumber, formatDate, formatCurrency, formatRelativeTime } = useI18n();

  const day = new Date(Date.UTC(2024, 0, 2));
  const dateOptions = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } as const;

  // A `$derived` that calls a formatter, with no `$locale` in sight.
  const derivedDate = $derived(formatDate(day, dateOptions));
</script>

<span data-testid="currency">{formatCurrency(1234.5, "EUR")}</span>
<span data-testid="date">{derivedDate}</span>
<span data-testid="pinned-number">{formatNumber(1234.5, undefined, "en")}</span>
<span data-testid="pinned-date">{formatDate(day, dateOptions, "en")}</span>
<span data-testid="pinned-currency">{formatCurrency(1234.5, "EUR", undefined, "en")}</span>
<span data-testid="pinned-relative">{formatRelativeTime(-2, "day", undefined, "en")}</span>
