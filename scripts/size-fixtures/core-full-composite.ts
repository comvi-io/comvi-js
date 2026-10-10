// Size-gate fixture: the OLD-ROOT semantics, recomposed on the base host — ICU +
// ambient tags + loader + plugin host + devtools discovery.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(attachLoader).use(plugins());
i18n.addMessages({ en: { greeting: "Hello, {name}!" } });
i18n.use(devtools());

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never));
