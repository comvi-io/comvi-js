"use client";

// Re-export hooks and components from @comvi/react
export { useI18n, useI18nContext, T, createI18n } from "@comvi/react";

export type { UseI18nReturn, TProps } from "@comvi/react";

// Next.js-specific I18nProvider (handles locale syncing for hydration)
export { I18nProvider } from "./client/I18nProvider";
export type { I18nProviderProps, MessagesMap } from "./client/I18nProvider";
