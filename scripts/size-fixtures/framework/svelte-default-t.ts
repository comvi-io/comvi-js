// Framework size fixture (single-entry P3): the default svelte app that also
// renders <T> — the tags rung of the ladder. Same one specifier as
// `svelte-default.ts`, one more imported binding.
//
// RETARGETED from `svelte-slim-t.ts`: the app no longer names `@comvi/core` for
// its constructor, because the published root carries it. The deleted
// `svelte-root-t.ts` fixture was a byte-identical body, so the -t axis is one
// row now instead of two measuring the same graph.
//
// The delta against `fw-svelte-default` is the whole <T> path: `dist/T.svelte`'s
// compiled output plus the pure `@comvi/core/rich-text` entry and the tag
// grammar it passes per call. Rendering <T> does NOT register syntax ambiently:
// `i18n.t("<b>…</b>")` remains literal unless the app explicitly imports
// `@comvi/core/tags`. That is the convergence change on this row — before it,
// `T.svelte` imported the ambient `@comvi/core/tags` entry, so this graph
// BOUGHT the tag-registration pair and could declare no sentinel for it.
//
// SENTINELS assert both ambient-registration modules and all four unused
// capability subpaths absent. Core's base entry is present by construction, as
// everywhere in this corpus.
import { createI18n, setI18nContext, T, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n, T);
