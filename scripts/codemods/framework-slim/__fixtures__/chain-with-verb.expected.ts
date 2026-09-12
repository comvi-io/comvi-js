// A tree written against a 0.5 PRE-RELEASE, where composition was spelled
// `.with(installer)`. Decision E kept one verb and it is `use`, so every step
// is renamed and NOTHING else about the chain moves: same installer, same
// argument, same position, so the order the host installs in is untouched.
//
// The last chain is the one worth stating: `wrapMetrics` is the reader's own
// installer, from the reader's own module, and the codemod cannot prove what it
// composes. It is renamed anyway — `with` exists on no 0.5.0 host, so `use` is
// the only spelling that can run, and the argument does not have to be
// understood to know that. (A SECOND run sees only `.use(wrapMetrics())` and
// can no longer tell a lowercase installer from a lowercase plugin factory, so
// it adds the `raw-plugin-needs-helper` advisory this run does not need.)
import { attachPlugins, createI18n, loader, plugins, attachLoader } from "@comvi/react";
import { wrapMetrics } from "./analytics";

export const one = createI18n({ locale: "en" }).use(attachLoader);

export const many = createI18n({ locale: "en" })
  .use(loader({ de: () => Promise.resolve({}) }))
  .use(plugins());

export const low = createI18n({ locale: "en" }).use(attachPlugins);

export const own = createI18n({ locale: "en" }).use(wrapMetrics());
