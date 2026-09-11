// Report-only — every `.use` whose argument the helper cannot wrap, the chain
// a needed import would be shadowed in, and `.use` on a stored host whose
// capability was never composed. All five are left byte-identical, each with
// the recipe.
import { createI18n } from "@comvi/react";
import { Analytics, Metrics, metrics } from "./analytics";

const extras = [Analytics({ id: 1 }), Metrics()];

export const spread = createI18n({ locale: "en" }).use(...extras);
export const array = createI18n({ locale: "en" }).use(extras);
export const stored = createI18n({ locale: "en" }).use(extras[0]);

// A local `definePlugin` would shadow the import the wrap needs.
function definePlugin() {
  return extras;
}

export const shadowed = createI18n({ locale: "en" }).use(Metrics());

// A LOWERCASE callee reads as an installer by the naming convention the
// packages follow, so it is left exactly as written and merely flagged:
// wrapping it would corrupt every `.use(myOwnInstaller())` a 0.5 app already
// has, and `.use` is where an installer belongs.
export const named = createI18n({ locale: "en" }).use(metrics());

// `.use` on a stored host is a change at CONSTRUCTION, not at the call site.
export const app = createI18n({ locale: "en" });
if (process.env.NODE_ENV !== "production") app.use(Analytics({ id: 2 }));

export { definePlugin };
