// `.with(icu())` was an installer during 0.5 development and is not part of the
// released surface: ICU is a compiler setting, so `compiler: icuCompiler` in the
// constructor options is the one enable form, for every catalog source.
//
// The codemod refuses the chain rather than guessing. `icu(myOwnCompiler)` can
// carry a compiler that is not `icuCompiler`, and the options object is not
// always inline, so the rewrite is the reader's to make.
import { createI18n, icu as installIcu, loader } from "@comvi/react";

export const i18n = createI18n({ locale: "en" }).with(installIcu()).with(loader());
