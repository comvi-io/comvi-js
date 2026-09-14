<script lang="ts">
  import { setI18nContext } from "../src/context";
  import T from "../src/T.svelte";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;
  export let i18nKey: string;
  export let params: Record<string, unknown> = {};
  // `allowedTags` is a 0.4 prop with no 0.5 equivalent
  // (`TBaseProps.allowedTags?: never`): a typed caller cannot pass it at all
  // (`tests/types/t-direct-props.test-d.ts` pins that as a compile error).
  // This wrapper simulates the JS caller that bypasses the type system — the
  // `as any` below is the same boundary `ContextConsumer.test.svelte` uses
  // for `i18nKey={"hello" as any}`.
  export let allowedTags: unknown = undefined;
  // For the cross-warning independence test: the deprecated `raw` PROP (not
  // `params.raw`), which triggers a DIFFERENT dev warning than allowedTags.
  export let raw: boolean | undefined = undefined;

  $: forwarded = {
    ...(allowedTags === undefined ? {} : { allowedTags }),
    ...(raw === undefined ? {} : { raw }),
  };

  setI18nContext(i18n);
</script>

<div data-testid="t-allowed-tags-tombstone">
  <T {i18nKey} {params} {...(forwarded as any)} />
</div>
