// Native-ESM contract for the published `@comvi/react` artifact.
//
// Run by `native-esm-rich-text.dist.test.ts` in a FRESH node process, never
// inside vitest. That is not a stylistic choice: ambient tag registration is
// module-global state installed by importing `@comvi/core/tags`, vitest
// externalizes `@comvi/core*` to native `import()` and shares that module
// registry across every test file in a worker, so ANY sibling file that ever
// touched the tags entry would pre-register the grammar and make the central
// assertion below pass for the wrong reason. One process, one module graph,
// one observation.
//
// Claims, in order:
//   1. importing the react root and building a host registers NOTHING —
//      string-API `t()` hands back `<tag>` markup literally even though a
//      handler for the tag was supplied;
//   2. `<T>` still renders rich text, because `prepareTranslation` passes the
//      tag grammar per call (`@comvi/core/rich-text`, no registration);
//   3. rendering `<T>` leaves no global trace: (1) still holds afterwards.
//
// Resolution is plain node: `@comvi/react` → its exports map → dist. No
// bundler, no alias, no transform.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createI18n, I18nProvider, T } from "@comvi/react";

const TEMPLATE = "Click <link>here</link> now";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  translation: { en: { msg: TEMPLATE } },
});

// The handler the ambient grammar would consume. With no grammar registered
// there is no `<` syntax to claim the markup, so it stays literal — this is
// what fails the moment anything in the react graph names `@comvi/core/tags`.
const linkHandler = ({ children }) => `[${children}]`;

assertEqual(
  i18n.t("msg", { link: linkHandler }),
  TEMPLATE,
  "string t() markup stays literal after importing @comvi/react",
);
const html = renderToStaticMarkup(
  React.createElement(
    I18nProvider,
    { i18n, autoInit: false },
    React.createElement(T, { i18nKey: "msg", components: { link: "strong" } }),
  ),
);

assertEqual(
  html,
  "Click <strong>here</strong> now",
  "<T> renders rich text via the per-call extension",
);

// Rendering <T> must not have promoted the per-call grammar to ambient.
assertEqual(
  i18n.t("msg", { link: linkHandler }),
  TEMPLATE,
  "string t() markup is still literal after <T> rendered",
);

console.log("REACT_NATIVE_ESM_RICH_TEXT_OK");
