import type { WrapperI18nInstance } from "@comvi/core";

/**
 * Where the app plugin parks its per-request instance for the Nitro teardown to
 * find, and the one name both sides have to agree on.
 *
 * The instance travels as DATA on the h3 event's context rather than through a
 * module's state, and that is the whole point of this file. The Vue app's
 * server bundle and the Nitro runtime are produced by different builds — it is
 * why nuxt's `impound` plugin refuses a `#build/*` alias on the nitro side at
 * all — so a WeakMap declared in one is not necessarily the WeakMap the other
 * reads. The event is the same object in both.
 */
export const REQUEST_HOSTS_KEY = "__comviRequestHosts";

/** All the teardown needs of an instance, and what both instance shapes have. */
export type RequestScopedInstance = Pick<WrapperI18nInstance, "destroy" | "reportError">;
