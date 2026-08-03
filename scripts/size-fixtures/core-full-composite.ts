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
// Gate: <= 8605 B min+gz, an owner-signed HARD ceiling with no automatic 2%
// margin. Observed 8604 B (minified payload 23957 B), so 1 B of current
// headroom — and that byte is an allowance for one proven effect only: the
// content-hash characters in the two chunk names this graph imports move gzip
// by ~1 B each while the payload length does not change. Any real byte fails.
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
