// Size-gate fixture: the base host plus `.use(devtools())` and nothing else —
// what the Comvi browser extension opt-in costs an app, read against
// `core-base`: discovery (the instance on `window.__COMVI__`) and the editor
// loader the extension calls.
import { createI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";

const i18n = createI18n({
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" } },
}).use(devtools());

console.log(i18n.t("greeting" as never, { name: "world" } as never));
