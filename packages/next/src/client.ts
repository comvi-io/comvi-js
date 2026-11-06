"use client";

/**
 * `@comvi/next/client`: the browser half of a server boundary. Client Components read through
 * `@comvi/react` (`useI18n`, `<T>`, `useLocale`, `useFormat` of `@comvi/react/format`).
 */
export { I18nProvider } from "./client/I18nProvider";
export type { ClientOptions, I18nProviderProps } from "./client/I18nProvider";
