// Framework size fixture (single-entry P4): the default Next.js CLIENT bundle
// that also renders `<T>` — the tags rung of next's client ladder. Same one
// specifier as `next-client-default.ts`, one more imported binding.
//
// NEW row in P4. The react ladder gained `fw-react-default-t` in P2 for exactly
// this shape, and a next client app pays for `<T>` through next's own entry
// (which re-exports react's component), so the rung is measured here rather
// than inferred from react's.
//
// The delta against `fw-next-client-default` is the whole `<T>` path: the
// component's own dist chunk plus the pure `@comvi/core/rich-text` entry and
// tag grammar it passes per call. Rendering `<T>` does NOT register syntax
// ambiently: `i18n.t("<b>…</b>")` stays literal unless the app explicitly
// imports `@comvi/core/tags`, which no next entry re-exports.
//
// SENTINELS assert both ambient-registration modules and all four unused
// capability subpaths absent. Core's base entry is present by construction, as
// everywhere in this corpus.
import { createI18n, I18nProvider, T, useI18n } from "@comvi/next/client";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
