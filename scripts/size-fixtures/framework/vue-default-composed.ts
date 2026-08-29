// Framework size fixture (single-entry P3): the default vue app built the
// OTHER way — an injected host through `createCore` + `createI18nFromCore`
// instead of the one-call preset. Same one specifier, same bindings, same base
// host; what differs is who constructs it.
//
// RETARGETED from `vue-slim.ts`, which named `@comvi/core` for its constructor
// and `@comvi/vue/slim` for the factory. Both specifiers collapsed onto the one
// entry that ships, so this app names exactly one package.
//
// INFORMATIONAL, not gated. It exists for a single number the converged ladder
// would otherwise lose: measured against `fw-vue-default`, the delta is vue's
// PRESET GLUE — the `VueI18n` construction path and the `ssrLocale` handling
// that react, solid and svelte have no counterpart for, because their
// `createI18n` is core's own constructor re-exported. Keeping it measured is
// what lets the changesets and the README state that delta instead of claiming
// it.
//
// Core's BASE entry is in this graph by construction: `createCore` IS its
// constructor. `vue` is external, so this measures the comvi graph only.
import { createCore, createI18nFromCore, useI18n } from "@comvi/vue";

const i18n = createI18nFromCore(
  createCore({
    locale: "en",
    translation: { en: { greeting: "Hello, {name}!" } },
  }),
  { ssrLocale: "en" },
);

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
