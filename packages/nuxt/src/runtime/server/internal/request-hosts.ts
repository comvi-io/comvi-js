import type { H3Event } from "h3";
import type { NuxtServerHost } from "../../../types";

/**
 * The per-request host registry and its teardown, kept apart from
 * `../utils/request-i18n` for one build-time reason: that module imports
 * `#build/comvi.setup` and `#build/comvi.host`, and nuxt's `impound` plugin
 * refuses a Vue app alias anywhere in the NITRO runtime graph — which a server
 * plugin is. So the plugin imports this file, whose only imports are types and
 * therefore vanish at build time.
 *
 * It is `server/internal/` rather than `server/utils/` so that
 * `addServerImportsDir` does not auto-import any of it into user code: none of
 * this is a server utility an app calls.
 */

// Keep one i18n instance per locale within a single request.
// This costs more than a single shared request instance, but it preserves
// SSR correctness when server code resolves multiple locales concurrently.
export const requestI18nMap = new WeakMap<object, Map<string, Promise<NuxtServerHost>>>();

/**
 * Contexts that already carry an end-of-response hook. The WeakMap above makes
 * the hosts COLLECTABLE, which is not the same as destroyed: a plugin's cleanup
 * (an interval, a socket, a subscription) runs only when someone calls
 * `destroy()`, and on the server nobody did.
 */
const cleanupHooked = new WeakSet<object>();

/**
 * Contexts whose hosts have been destroyed, so a LATER call is refused rather
 * than silently handed a host nothing will tear down: the hook has already
 * fired, and `once("close", …)` on a closed response never fires again.
 */
const tornDown = new WeakSet<object>();

/**
 * Set by the Nitro server plugin (`../plugins/request-cleanup`). Nitro's
 * `afterResponse` runs after the HANDLER returned as well as after the response
 * was written, which the response's own `close` event cannot promise, so when
 * that plugin is installed it owns teardown outright and this module hooks
 * nothing: two mechanisms on one request is how a host gets destroyed twice.
 */
let nitroOwnsCleanup = false;

/** Called by the Nitro server plugin at server start. */
export function claimRequestCleanup(): void {
  nitroOwnsCleanup = true;
}

const AFTER_RESPONSE_MESSAGE =
  "[comvi/nuxt] useTranslation()/loadTranslations() after the response ended — the request " +
  "host is already destroyed; translate before responding, or create your own host";

export const getContextKey = (event: H3Event): object => {
  if (event.context && typeof event.context === "object") {
    return event.context as object;
  }
  return event as unknown as object;
};

/** Throws when this request's hosts are already gone. */
export function assertRequestLive(contextKey: object): void {
  if (tornDown.has(contextKey)) {
    throw new Error(AFTER_RESPONSE_MESSAGE);
  }
}

/**
 * Tear down every host this request built.
 *
 * A rejected creation promise has no host to destroy and is skipped — the
 * rejection was already delivered to the caller that asked for that locale.
 * A `destroy()` that rejects is reported through the host's own error channel:
 * the response is written by now, so there is nowhere else for it to go, and
 * throwing here would surface as an unhandled rejection in the server process.
 */
async function destroyRequestHosts(contextKey: object): Promise<void> {
  // Marked BEFORE the first await: anything that asks while the teardown is in
  // flight would otherwise create a host the loop below has already walked past.
  tornDown.add(contextKey);
  const localeInstances = requestI18nMap.get(contextKey);
  if (!localeInstances) return;
  requestI18nMap.delete(contextKey);
  const pending = [...localeInstances.values()];
  localeInstances.clear();

  for (const instancePromise of pending) {
    let i18n: NuxtServerHost;
    try {
      i18n = await instancePromise;
    } catch {
      continue;
    }
    try {
      await i18n.destroy();
    } catch (error) {
      try {
        i18n.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "request-cleanup",
        });
      } catch {
        // A reporter that throws must not take the process down either.
      }
    }
  }
}

/**
 * Tear the request's hosts down once the handler has let go of the event.
 *
 * Nitro calls this from `afterResponse` and from `error`; without Nitro it is
 * what the response's `close` hook below runs. The two cases differ in one
 * thing only — whether the response was ENDED:
 *
 *  - ended: the handler has returned and the body is written, so destroy now.
 *  - not ended: the socket died under a handler that may still be rendering,
 *    and `core.destroy()` clears the catalog. Destroying here hands that render
 *    missing-key output, which a `defineCachedEventHandler` or an `swr` / `isr`
 *    route would then WRITE INTO THE CACHE and serve to everyone. So wait for
 *    the response to end after all, or — if it never does — for one macrotask,
 *    by which time a handler whose remaining work is microtasks has finished.
 *    Whichever comes first wins; `destroyRequestHosts` is idempotent.
 *
 * The residual race is stated in `docs/design/ssr.md`: a handler that yields to
 * a timer or real I/O AFTER an abort can still be torn down under, and its next
 * `getRequestI18n` then throws rather than returning a half-dead host.
 */
export function scheduleRequestCleanup(event: H3Event): void {
  const contextKey = getContextKey(event);
  const res = event.node.res;
  if (res.writableEnded) {
    void destroyRequestHosts(contextKey);
    return;
  }
  const run = (): void => {
    void destroyRequestHosts(contextKey);
  };
  res.once("finish", run);
  setTimeout(run, 0);
}

/**
 * One hook per request, on `close` — the fallback for a plain h3 server with no
 * Nitro plugin (which is also what the test harness exercises).
 *
 * `finish` fires only for a response that was written in full, and `end` is not
 * an event on the response at all; `close` fires exactly once for a finished,
 * an aborted and an errored response alike. h3 1.x always provides
 * `event.node.res` — the web adapter builds one with node-mock-http, whose
 * `end()` emits `close` synchronously with the body already buffered, so a
 * Cloudflare / Deno / Bun preset is covered too.
 */
export function hookRequestCleanup(event: H3Event, contextKey: object): void {
  if (nitroOwnsCleanup || cleanupHooked.has(contextKey)) return;
  cleanupHooked.add(contextKey);
  event.node.res.once("close", () => {
    scheduleRequestCleanup(event);
  });
}
