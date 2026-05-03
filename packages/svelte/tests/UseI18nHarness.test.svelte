<script lang="ts">
  import { onDestroy } from "svelte";
  import { setI18nContext } from "../src/context";
  import { useI18n } from "../src/useI18n";

  export let i18n: any;
  export let autoInit = false;

  setI18nContext(i18n, { autoInit });

  const {
    t,
    locale,
    isLoading,
    isInitializing,
    isInitialized,
    cacheRevision,
    tRaw,
    setLocale,
    addTranslations,
    addActiveNamespace,
    clearTranslations,
    hasLocale,
    hasTranslation,
    getLoadedLocales,
    getActiveNamespaces,
    getDefaultNamespace,
    on,
    formatNumber,
    formatDate,
    formatCurrency,
    formatRelativeTime,
    dir,
  } = useI18n();

  const { t: adminT } = useI18n("admin");

  let hello: string;
  let adminTitle: string;
  let adminHello: string;
  let dynamic: string;
  let hasFrench: string;
  let hasAdminTitle: string;
  let loadedLanguages: string;
  let activeNamespaces: string;
  let defaultNamespace: string;
  let number: string;
  let currency: string;
  let date: string;
  let relative: string;
  let rawIsStructured: string;
  let events: string[] = [];

  const unsubscribeLanguageEvents = on("localeChanged", ({ from, to }) => {
    events = [...events, `${from}->${to}`];
  });

  onDestroy(() => {
    unsubscribeLanguageEvents();
  });

  function stopEvents(): void {
    unsubscribeLanguageEvents();
  }

  function switchTo(localeCode: string): void {
    void setLocale(localeCode);
  }

  function loadAdmin(): void {
    void addActiveNamespace("admin");
  }

  function addDynamicTranslations(): void {
    addTranslations({
      en: { dynamic: "Dynamic" },
      fr: { dynamic: "Dynamique" },
      ar: { dynamic: "ديناميكي" },
    });
  }

  function clearEnglishCommon(): void {
    clearTranslations("en", "common");
  }

  $: {
    void $t;
    void $adminT;
    void $locale;
    void $isLoading;
    void $isInitializing;
    void $isInitialized;
    void $cacheRevision;
    void $tRaw;

    hello = String($t("hello"));
    rawIsStructured = String(Array.isArray($tRaw("hello")));
    adminTitle = String($adminT("title"));
    adminHello = String($adminT("hello", { ns: "common" }));
    dynamic = String($t("dynamic"));
    hasFrench = String(hasLocale("fr", "common"));
    hasAdminTitle = String(hasTranslation("title", undefined, "admin", true));
    loadedLanguages = getLoadedLocales().slice().sort().join(",");
    activeNamespaces = getActiveNamespaces().slice().sort().join(",");
    defaultNamespace = getDefaultNamespace();
    number = formatNumber(1234.5);
    currency = formatCurrency(99.99, "USD");
    date = formatDate(new Date("2024-01-02T00:00:00.000Z"), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    });
    relative = formatRelativeTime(-2, "day");
  }
</script>

<div data-testid="hello">{hello}</div>
<div data-testid="raw-structured">{rawIsStructured}</div>
<div data-testid="admin-title">{adminTitle}</div>
<div data-testid="admin-common">{adminHello}</div>
<div data-testid="dynamic">{dynamic}</div>
<div data-testid="language">{$locale}</div>
<div data-testid="dir">{$dir}</div>
<div data-testid="loading">{String($isLoading)}</div>
<div data-testid="initializing">{String($isInitializing)}</div>
<div data-testid="initialized">{String($isInitialized)}</div>
<div data-testid="cache-revision">{$cacheRevision}</div>
<div data-testid="has-french">{hasFrench}</div>
<div data-testid="has-admin-title">{hasAdminTitle}</div>
<div data-testid="loaded-languages">{loadedLanguages}</div>
<div data-testid="active-namespaces">{activeNamespaces}</div>
<div data-testid="default-namespace">{defaultNamespace}</div>
<div data-testid="number">{number}</div>
<div data-testid="currency">{currency}</div>
<div data-testid="date">{date}</div>
<div data-testid="relative">{relative}</div>
<div data-testid="events">{events.join("|")}</div>

<button data-testid="switch-fr" on:click={() => switchTo("fr")}>fr</button>
<button data-testid="switch-ar" on:click={() => switchTo("ar")}>ar</button>
<button data-testid="load-admin" on:click={loadAdmin}>load admin</button>
<button data-testid="add-dynamic" on:click={addDynamicTranslations}>add dynamic</button>
<button data-testid="clear-common-en" on:click={clearEnglishCommon}>clear en common</button>
<button data-testid="unsubscribe-events" on:click={stopEvents}>stop events</button>
