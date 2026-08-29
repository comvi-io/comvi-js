// Report-only — every `.use` whose plugin is not a statically named
// factory call, the chain a needed import would be shadowed in, and `.use` on a
// stored host. All five are left byte-identical, each with the recipe.
import { createI18n } from "@comvi/react";
import { Analytics, Metrics } from "./analytics";

const extras = [Analytics({ id: 1 }), Metrics()];

export const spread = createI18n({ locale: "en" }).use(...extras);
export const array = createI18n({ locale: "en" }).use(extras);
export const stored = createI18n({ locale: "en" }).use(extras[0]);

// A local `plugins` would shadow the import the rewrite needs.
function plugins() {
  return extras;
}

export const shadowed = createI18n({ locale: "en" }).use(Metrics());

// `.use` on a stored host is a change at CONSTRUCTION, not at the call site.
export const app = createI18n({ locale: "en" });
if (process.env.NODE_ENV !== "production") app.use(Analytics({ id: 2 }));

export { plugins };
