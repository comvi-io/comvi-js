// Native-ESM contract for the `T` re-export from `@comvi/next/client`.
// Run in a fresh process: ambient tag registration is module-global, so a
// shared Vitest worker could inherit it from an unrelated tags test.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createI18n, I18nProvider, T } from "@comvi/next/client";

const template = "Click <link>here</link> now";
const linkHandler = ({ children }) => `[${children}]`;

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
  translation: { en: { msg: template } },
});

assertEqual(
  i18n.t("msg", { link: linkHandler }),
  template,
  "importing @comvi/next/client does not register string-API tags",
);

const html = renderToStaticMarkup(
  React.createElement(
    I18nProvider,
    { i18n, locale: "en", autoInit: false },
    React.createElement(T, { i18nKey: "msg", components: { link: "strong" } }),
  ),
);

assertEqual(html, "Click <strong>here</strong> now", "Next's T re-export still renders rich text");
assertEqual(
  i18n.t("msg", { link: linkHandler }),
  template,
  "rendering Next's T re-export leaves string-API tags literal",
);

console.log("NEXT_NATIVE_ESM_RICH_TEXT_OK");
