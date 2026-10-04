// 0.5 «first impression»: the catalog cache is `messagesCache`. No alias.
import type { UseI18nReturn } from "../../src/composables/useI18n";

declare const bag: UseI18nReturn;
export const cache = bag.messagesCache;
// @ts-expect-error renamed to `messagesCache` (no alias).
void bag.translationCache;
