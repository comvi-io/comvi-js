// Report-only — the host came from the app's own module, so the codemod cannot
// know where the installers live. It names the binding it wanted and stops:
// guessing a module path is the one silent breakage a migration must not ship.
import { createI18n as makeHost } from "./i18n";
import { Analytics } from "./analytics";

export const i18n = makeHost({ locale: "en" }).use(Analytics({ id: 1 }));
