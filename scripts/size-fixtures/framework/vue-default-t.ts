// Framework size fixture (single-entry P3): the default vue app that also
// renders <T> — the tags rung of the ladder. Same one specifier as
// `vue-default.ts`, one more imported binding.
//
// RETARGETED from `vue-slim-t.ts`: the app no longer names `@comvi/core` for
// its constructor, because the published root carries it, and it goes through
// the one-call preset so the row is read directly against `fw-vue-default`.
// The deleted `vue-root-t.ts` fixture measured the same wrapper through the
// same preset, so the -t axis is one row now instead of two.
//
// The delta against `fw-vue-default` is the whole <T> path: the component's own
// dist chunk plus the pure `@comvi/core/rich-text` entry and tag grammar it
// passes per call. Rendering <T> does NOT register syntax ambiently:
// `i18n.t("<b>…</b>")` remains literal unless the app explicitly imports
// `@comvi/core/tags`. That is a change from the pre-convergence row, where
// vue's `<T>` still imported the ambient entry.
//
// SENTINELS assert both ambient-registration modules and all four unused
// capability subpaths absent. Core's base entry is present by construction, as
// everywhere in this corpus.
import { createI18n, T, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
  ssrLocale: "en",
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
