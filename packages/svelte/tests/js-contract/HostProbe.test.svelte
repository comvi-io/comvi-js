<script>
  // Shared probe for the §2.4 JS-consumer contract tests.
  //
  // Deliberately a PLAIN JavaScript <script> block: `lang="ts"` would make the
  // compiler reject the shapes those tests assert, which proves nothing about
  // what a JavaScript consumer experiences at runtime.
  //
  // `read` runs during component initialisation — the only place svelte
  // context is readable, and therefore the only place `useI18n()`,
  // `useI18nLoader()` and `useI18nPlugins()` may be called. Anything it throws
  // propagates out of `mount()`, which is exactly the acquisition-time failure
  // the contract pins. All three props are init-only by design, so this uses
  // the legacy `export let` form (like tests/UseI18nHarness.test.svelte)
  // rather than `$props()`, whose runes-mode reads would warn about capturing
  // an initial value.
  import { setI18nContext } from '../../src/context';

  export let i18n;
  export let read;
  export let report;

  setI18nContext(i18n, { autoInit: false });
  report(read());
</script>
