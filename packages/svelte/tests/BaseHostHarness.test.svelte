<script lang="ts">
  // The host-safe `useI18n()` surface only: nothing here may touch a
  // loader/plugin member. `useI18n()` used to eagerly `.bind()` four of them
  // and threw on a base host before this component could render at all.
  import { setI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;
  export let report: (bag: ReturnType<typeof useI18n>) => void = () => {};

  setI18nContext(i18n, { autoInit: false });

  const bag = useI18n();
  const { t, locale, dir, setLocale, addTranslations, formatNumber, formatCurrency } = bag;

  report(bag);

  function switchToFrench(): void {
    void setLocale("fr");
  }

  function addLate(): void {
    addTranslations({ en: { late: "Late binding" } });
  }
</script>

<div data-testid="greeting">{$t("greeting", { name: "Ada" })}</div>
<div data-testid="late">{$t("late")}</div>
<div data-testid="locale">{$locale}</div>
<div data-testid="dir">{$dir}</div>
<div data-testid="number">{formatNumber(1234.5)}</div>
<div data-testid="currency">{formatCurrency(10, "USD")}</div>

<button data-testid="switch-fr" on:click={switchToFrench}>fr</button>
<button data-testid="add-late" on:click={addLate}>add late</button>
