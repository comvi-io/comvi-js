// A `.with(` reached through a STORED binding never enters a chain rooted at
// `createI18n(…)`, so the chain walk never saw it and the tool printed
// "nothing to migrate — this tree is already on the 0.5.0 surface" over a file
// that still called a method 0.5.0 deleted. A certification nobody can act on
// is worse than a rewrite nobody asked for.
//
// So a residual sweep finishes the job. Every surviving `.with` on a PROVABLE
// Comvi host is renamed, transitively: `withLoader` holds whatever `i18n` held,
// because returning the host it was given is what makes an installer an
// installer, and `own` holds whatever `withPlugins` did. The rename is as safe
// here as it is in a chain — `with` exists on no 0.5.0 host, so `use` with the
// same argument in the same position is the only spelling that can run.
import { createI18n, plugins, attachLoader } from "@comvi/react";
import { wrapMetrics } from "./analytics";

export const i18n = createI18n({ locale: "en" });

const withLoader = i18n.use(attachLoader);

export const withPlugins = withLoader.use(plugins());

export const own = withPlugins.use(wrapMetrics());
