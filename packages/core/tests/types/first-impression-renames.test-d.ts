// Type-level contract for the 0.5 «first impression» renames. 0.5 ships no
// aliases: every old name must be rejected outright, not merely deprecated.
import { createI18n, type WrapperI18nHost } from "@comvi/core";
import { loader } from "@comvi/core/loader";

declare const base: ReturnType<typeof createI18n>;
const withLoader = createI18n({ locale: "en" }).use(loader({}));
declare const host: WrapperI18nHost;

// One awaitable locale switch: `setLocale(): Promise<void>`.
export const switched: Promise<void>[] = [
  base.setLocale("en"),
  withLoader.setLocale("en"),
  host.setLocale("en"),
];

// @ts-expect-error `setLocaleAsync` was renamed to `setLocale` (no alias).
base.setLocaleAsync("en");
// @ts-expect-error `setLocaleAsync` was renamed to `setLocale` (no alias).
withLoader.setLocaleAsync("en");
// @ts-expect-error `setLocaleAsync` was renamed to `setLocale` (no alias).
host.setLocaleAsync("en");

// Inline catalogs are `messages` («messages» = the catalog, «translation» = the
// string for one key), and so are the catalog-level methods.
createI18n({ locale: "en", messages: { en: { hi: "Hi" } } });
// @ts-expect-error the `translation` option was renamed to `messages` (no alias).
createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });

base.addMessages({ en: { hi: "Hi" } });
export const catalog: Record<string, unknown> = base.getMessages();
base.clearMessages();
export const reloaded: Promise<void> = withLoader.reloadMessages();
base.on("messagesCleared", () => {});

// @ts-expect-error renamed to `addMessages` (no alias).
base.addTranslations({ en: { hi: "Hi" } });
// @ts-expect-error renamed to `getMessages` (no alias).
base.getTranslations();
// @ts-expect-error renamed to `clearMessages` (no alias).
base.clearTranslations();
// @ts-expect-error renamed to `reloadMessages` (no alias).
void withLoader.reloadTranslations();
// @ts-expect-error the `translationsCleared` event was renamed to `messagesCleared`.
base.on("translationsCleared", () => {});
