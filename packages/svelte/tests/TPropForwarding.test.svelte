<script lang="ts">
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;
  export let i18nKey: string;
  export let params: Record<string, unknown> = {};
  // Each `pass*` flag decides whether the matching prop reaches <T> AT ALL —
  // that omitted-vs-explicit distinction is the whole subject of the suite, so
  // the spread below must never carry a key whose flag is false.
  export let passNs: boolean = false;
  export let ns: string | undefined = undefined;
  export let passLocale: boolean = false;
  export let locale: string | undefined = undefined;
  export let passFallback: boolean = false;
  export let fallback: string | undefined = undefined;
  export let passRaw: boolean = false;
  export let raw: boolean = false;

  $: forwarded = {
    ...(passNs ? { ns } : {}),
    ...(passLocale ? { locale } : {}),
    ...(passFallback ? { fallback } : {}),
    ...(passRaw ? { raw } : {}),
  };

  setI18nContext(i18n);
</script>

<div data-testid="t-prop-forwarding-wrapper">
  <T {i18nKey} {params} {...forwarded} />
</div>
