<script lang="ts">
  // The documented "manual init wins" recipe: setI18nContext schedules its
  // auto-init in a microtask, and this component starts init() before that
  // microtask runs.
  import { setI18nContext } from "../src/context";
  import type { WrapperI18nHost } from "@comvi/core";

  export let i18n: WrapperI18nHost;

  setI18nContext(i18n);
  void i18n.init();
</script>

<div data-testid="mounted">mounted</div>
