// a plugin the codemod does not know keeps its `.use`, and the chain
// gains the generic plugin host BEFORE it.
//
// `plugins()` attaches idempotently, so the third chain — which composed the
// host too late for its own `.use` — is corrected by inserting one, never by
// moving the author's call: moving it would reorder capability installation.
import { createI18n } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import { Analytics } from "./analytics";

export const composed = createI18n({ locale: "en" }).with(plugins()).use(Analytics({ id: 1 }));

export const bare = createI18n({ locale: "en" }).use(Analytics({ id: 2 }));

export const late = createI18n({ locale: "en" })
  .use(Analytics({ id: 3 }))
  .with(plugins());
