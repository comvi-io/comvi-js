// The same move, seen from a binding root: every wrapper package re-exported
// `flattenCatalog` from its single entry, and none of them does any more.
//
// The clause carries `createI18n` too, which still belongs to `@comvi/react`,
// so the specifier is SPLIT off onto `@comvi/core` rather than dragging the
// host's import along with it. The alias is the user's own name and survives
// the move untouched, at the call site and in the new clause alike.
import { createI18n } from "@comvi/react";
import { flattenCatalog as flat } from "@comvi/core";

const preflattened = flat({ footer: { legal: "Legal" } });

export const i18n = createI18n({ locale: "en", translation: { en: preflattened } });
