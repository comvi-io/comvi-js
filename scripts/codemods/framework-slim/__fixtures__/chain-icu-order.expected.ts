// §7.3 — the ONE remote-ICU ordering the codemod can prove: `icu()` has to
// reach the host before a loader ingests anything, and in a static chain both
// steps are visible in one expression.
//
// The user's own characters move; `icu()` and `loader()` are both pure
// installers that touch different state, so swapping them changes nothing but
// the moment the compiler is decided.
import { createI18n, icu as installIcu, loader as installLoader } from "@comvi/react";

export const i18n = createI18n({ locale: "en" }).with(installIcu()).with(installLoader());
