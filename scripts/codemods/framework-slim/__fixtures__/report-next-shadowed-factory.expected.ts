// `createNextI18n` imported from `@comvi/next` AND declared locally: the text
// does not say which call sites the shadow covers, so every result chain in
// the module is left untouched and the declaration is reported once.
import { createNextI18n } from "@comvi/next";
import { Analytics } from "./analytics";

export const nextI18n = createNextI18n({ locales: ["en"], defaultLocale: "en" }).useClient(
  Analytics(),
);

export function local() {
  const createNextI18n = (options: { locales: string[] }) => options;
  return createNextI18n({ locales: ["en"] });
}
