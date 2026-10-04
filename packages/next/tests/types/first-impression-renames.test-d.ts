// 0.5 «first impression» renames on the Next surface: the inline catalog is
// `messages` and the server helper is `loadMessages`. No aliases.
import { createNextI18n } from "@comvi/next";
import * as server from "@comvi/next/server";
import type { LoadMessagesOptions, MessagesMap } from "@comvi/next/server";

createNextI18n({ locales: ["en"], defaultLocale: "en", messages: { en: { hi: "Hi" } } });
// @ts-expect-error the `translation` option was renamed to `messages` (no alias).
createNextI18n({ locales: ["en"], defaultLocale: "en", translation: { en: { hi: "Hi" } } });

export const load: (locale: string, options?: LoadMessagesOptions) => Promise<MessagesMap> =
  server.loadMessages;
// @ts-expect-error `loadTranslations` was renamed to `loadMessages` (no alias).
void server.loadTranslations;
