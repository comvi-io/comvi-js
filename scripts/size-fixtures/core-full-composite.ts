// Size-gate fixture: the OLD-ROOT semantics, recomposed on the base host —
// ICU + ambient tags + loader + plugin host + devtools discovery.
//
// PARITY ORDERING — the recipe proved behaviour-identical to the 0.4 composed
// host by packages/core/tests/features/composite-parity.test.ts (18/18): loader
// + plugin host installed FIRST (so the loader's nested-catalog flattener is
// present when the catalog is ingested), discovery LAST (so `instanceId` stays
// the final public own property, matching the root constructor's assignment
// order).
//
// The STATEMENT SHAPE is normative too: an earlier parity-ordered draft that
// introduced a `const host = …` temporary cost 4 B for fixture shape alone.
// Same observable app surface as the pre-convergence `full.ts`.
//
// Gated on the standard rule — measured + 5% — like every other budget row;
// the 8605 B owner-signed ceiling this header used to quote is retired. See
// scripts/size-budgets.md for why, and for the chunk-hash effect (gzip moves
// ~1 B per imported content-hashed chunk name on any source edit, with the
// minified payload unchanged) that the 5% margin now absorbs.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
i18n.addTranslations({ en: { greeting: "Hello, {name}!" } });
i18n.with(devtools());

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never));
