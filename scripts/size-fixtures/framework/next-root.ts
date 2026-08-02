// Framework size fixture (plan P0.1/P0.7): the next SERVER graph as it exists
// today — `createNextI18n` (root core) plus the public server helpers. This is
// the comparison base for P5: S = minzip(fw-next-root) - minzip(fw-next-server-slim-loader).
// `next` and `react` are external: this measures the comvi graph only.
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
