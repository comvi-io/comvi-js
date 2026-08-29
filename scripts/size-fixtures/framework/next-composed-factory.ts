// Framework size fixture: the PUBLISHED `@comvi/next` root — `createNextI18n` (whose
// composed host is built by the package's non-exported builder over the converged base
// core) plus the public server helpers.
import { createNextI18n } from "@comvi/next";
import { getI18n, loadTranslations, setRequestLocale } from "@comvi/next/server";

const { i18n, routing } = createNextI18n({
  locales: ["en", "de"],
  defaultLocale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(
  i18n.t("greeting" as never, { name: "world" } as never),
  routing.defaultLocale,
  getI18n,
  loadTranslations,
  setRequestLocale,
);
