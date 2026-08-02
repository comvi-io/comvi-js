// Size-gate fixture: the composed slim surface — `@comvi/core/slim` plus both
// capability subpaths (`/loader`, `/plugins`). Informational (printed, never
// gated): it exists so the cost of "slim with everything attached" is visible
// next to bare slim, which is what the Phase-7 decomposition trades against.
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";

const i18n = attachPlugins(
  attachLoader(
    createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello, {name}!" } },
    }),
  ),
);

i18n.registerLoader(async () => ({ greeting: "Hello, {name}!" }));

console.log(i18n.t("greeting" as never, { name: "world" } as never));
