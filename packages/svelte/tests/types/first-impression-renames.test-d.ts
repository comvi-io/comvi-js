// 0.5 «first impression»: the catalog cache accessor is `getMessagesCache`. No alias.
import type { UseI18nReturn } from "../../src/useI18n";

declare const bag: UseI18nReturn;
export const cache = bag.getMessagesCache();
// @ts-expect-error renamed to `getMessagesCache` (no alias).
void bag.getTranslationCache;
