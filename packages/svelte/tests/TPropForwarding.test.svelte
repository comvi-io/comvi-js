<script lang="ts">
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";

  export let i18n: any;
  export let i18nKey: string;
  export let params: Record<string, unknown> = {};
  // Conditionally passed, so the harness can exercise the "prop explicitly
  // provided vs omitted" distinction.
  export let passNs: boolean = false;
  export let ns: string | undefined = undefined;
  export let passLocale: boolean = false;
  export let locale: string | undefined = undefined;
  export let passFallback: boolean = false;
  export let fallback: string | undefined = undefined;
  export let passRaw: boolean = false;
  export let raw: boolean = false;

  setI18nContext(i18n);
</script>

<div data-testid="t-prop-forwarding-wrapper">
  {#if passNs && passLocale && passFallback && passRaw}
    <T {i18nKey} {params} {ns} {locale} {fallback} {raw} />
  {:else if passNs && passLocale && passFallback}
    <T {i18nKey} {params} {ns} {locale} {fallback} />
  {:else if passNs && passLocale && passRaw}
    <T {i18nKey} {params} {ns} {locale} {raw} />
  {:else if passNs && passFallback && passRaw}
    <T {i18nKey} {params} {ns} {fallback} {raw} />
  {:else if passLocale && passFallback && passRaw}
    <T {i18nKey} {params} {locale} {fallback} {raw} />
  {:else if passNs && passLocale}
    <T {i18nKey} {params} {ns} {locale} />
  {:else if passNs && passFallback}
    <T {i18nKey} {params} {ns} {fallback} />
  {:else if passNs && passRaw}
    <T {i18nKey} {params} {ns} {raw} />
  {:else if passLocale && passFallback}
    <T {i18nKey} {params} {locale} {fallback} />
  {:else if passLocale && passRaw}
    <T {i18nKey} {params} {locale} {raw} />
  {:else if passFallback && passRaw}
    <T {i18nKey} {params} {fallback} {raw} />
  {:else if passNs}
    <T {i18nKey} {params} {ns} />
  {:else if passLocale}
    <T {i18nKey} {params} {locale} />
  {:else if passFallback}
    <T {i18nKey} {params} {fallback} />
  {:else if passRaw}
    <T {i18nKey} {params} {raw} />
  {:else}
    <T {i18nKey} {params} />
  {/if}
</div>
