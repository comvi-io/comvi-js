// Size-gate fixture: the composed slim surface — `@comvi/core` plus both capability
// subpaths (`/loader`, `/plugins`).
import { createI18n } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
})
  .with(loader({ en: async () => ({ greeting: "Hello, {name}!" }) }))
  .with(plugins());

console.log(i18n.t("greeting" as never, { name: "world" } as never));
