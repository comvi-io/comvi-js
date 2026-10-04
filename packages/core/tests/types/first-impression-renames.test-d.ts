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
