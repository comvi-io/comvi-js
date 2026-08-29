// Framework size fixture (single-entry P3): the default solid app that also
// renders <T> — the tags rung of the ladder. Same one specifier as
// `solid-default.ts`, one more imported binding.
//
// RETARGETED from `solid-slim-t.ts`: the app no longer names `@comvi/core` for
// its constructor, because the published root carries it. The deleted
// `solid-root-t.ts` fixture was a byte-identical body, so the -t axis is one
// row now instead of two measuring the same graph.
//
// The delta against `fw-solid-default` is the whole <T> path: the component's
// own dist chunk plus the pure `@comvi/core/rich-text` entry and tag grammar it
// passes per call. Rendering <T> does NOT register syntax ambiently:
// `i18n.t("<b>…</b>")` remains literal unless the app explicitly imports
// `@comvi/core/tags`.
//
// SENTINELS assert both ambient-registration modules and all four unused
// capability subpaths absent. Core's base entry is present by construction, as
// everywhere in this corpus.
import { createI18n, I18nProvider, T, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
