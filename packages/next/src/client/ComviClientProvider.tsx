"use client";

// Internal: rendered only by the server `ComviProvider` (`@comvi/next/server`),
// never exported. It is the library's copy of the `"use client"` wrapper an app
// used to write itself: the instance cannot cross the RSC boundary, so it is
// imported HERE, in the client graph, from the module `withComvi({ config })`
// aliased to `@comvi/next/config`. The server hands over only `locale` and the
// plain `messages` it loaded.
import type { ReactNode } from "react";
import * as configModule from "@comvi/next/config";
import { I18nProvider } from "./I18nProvider";
import type { I18nProviderProps, MessagesMap } from "./I18nProvider";

/** Read through a value, never as named imports: `routing` is optional. */
interface ConfigModule {
  readonly i18n?: I18nProviderProps["i18n"];
  readonly routing?: I18nProviderProps["routing"];
}
const config: ConfigModule = configModule;

export interface ComviClientProviderProps {
  locale: string;
  messages: MessagesMap;
  children?: ReactNode;
}

export function ComviClientProvider({ locale, messages, children }: ComviClientProviderProps) {
  const { i18n, routing } = config;
  if (!i18n) {
    // The server half checks first; this is the client graph built without
    // the alias (a next.config that dropped withComvi between builds).
    throw new Error(
      "[@comvi/next] <ComviProvider> needs withComvi({ config }) in next.config: " +
        "the client reads the i18n instance from that module.",
    );
  }
  return (
    <I18nProvider i18n={i18n} routing={routing} locale={locale} messages={messages}>
      {children}
    </I18nProvider>
  );
}
