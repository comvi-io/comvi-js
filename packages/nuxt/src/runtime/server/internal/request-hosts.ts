import type { H3Event } from "h3";
import type { NuxtServerInstance } from "../../../types";
import { REQUEST_HOSTS_KEY, type RequestScopedInstance } from "../../request-hosts-key";

/**
 * The per-request instance registry and its teardown, kept apart from
 * `../utils/request-i18n`: that module also imports the generated instance and
 * setup modules (`#comvi/setup`, `#comvi/i18n`) to build an instance, and the
 * server plugin needs none of that. So the plugin imports this file, whose
 * only imports are types and therefore vanish at build time.
 *
 * It is `server/internal/` rather than `server/utils/` so that
 * `addServerImportsDir` does not auto-import any of it into user code: none of
 * this is a server utility an app calls.
 */

// Keep one i18n instance per locale within a single request.
// This costs more than a single shared request instance, but it preserves
// SSR correctness when server code resolves multiple locales concurrently.
export const requestI18nMap = new WeakMap<object, Map<string, Promise<NuxtServerInstance>>>();

/**
 * Contexts that already carry an end-of-response hook. The WeakMap above makes
 * the instances COLLECTABLE, which is not the same as destroyed: a plugin's cleanup
 * (an interval, a socket, a subscription) runs only when someone calls
 * `destroy()`, and on the server nobody did.
 */
const cleanupHooked = new WeakSet<object>();

/**
 * Contexts whose instances have been destroyed, so a LATER call is refused rather
 * than silently handed an instance nothing will tear down: the hook has already
 * fired, and `once("close", …)` on a closed response never fires again.
 */
const tornDown = new WeakSet<object>();

/**
 * Set by the Nitro server plugin (`../plugins/request-cleanup`). Nitro's
 * `afterResponse` runs after the HANDLER returned as well as after the response
 * was written, which the response's own `close` event cannot promise, so when
 * that plugin is installed it owns teardown outright and this module hooks
 * nothing: two mechanisms on one request is how an instance gets destroyed twice.
 */
let nitroOwnsCleanup = false;

/** Called by the Nitro server plugin at server start. */
export function claimRequestCleanup(): void {
  nitroOwnsCleanup = true;
}

const AFTER_RESPONSE_MESSAGE =
  "[@comvi/nuxt] useTranslation()/loadMessages() after the response ended: the request " +
  "instance is already destroyed. Translate before responding, or create your own instance.";

export const getContextKey = (event: H3Event): object => {
  if (event.context && typeof event.context === "object") {
    return event.context as object;
  }
  return event as unknown as object;
};

/** Throws when this request's instances are already gone. */
export function assertRequestLive(contextKey: object): void {
  if (tornDown.has(contextKey)) {
    throw new Error(AFTER_RESPONSE_MESSAGE);
  }
}

/**
 * Tear down every instance this request built: the app plugin's SSR instance and every
 * locale instance the server utilities made.
 *
 * A rejected creation promise has no instance to destroy and is skipped — the
 * rejection was already delivered to the caller that asked for that locale.
 */
async function destroyRequestInstances(contextKey: object): Promise<void> {
  // Marked BEFORE the first await: anything that asks while the teardown is in
  // flight would otherwise create an instance the loop below has already walked past.
  tornDown.add(contextKey);

  const localeInstances = requestI18nMap.get(contextKey);
  requestI18nMap.delete(contextKey);
  const pending = localeInstances ? [...localeInstances.values()] : [];
  localeInstances?.clear();

  // The app plugin's own SSR instance, parked on the event context because the app
  // bundle and the nitro bundle do not share module state (see
  // `runtime/request-hosts-key.ts`).
  const context = contextKey as Record<string, unknown>;
  const parked = context[REQUEST_HOSTS_KEY];
  if (Array.isArray(parked)) {
    delete context[REQUEST_HOSTS_KEY];
    for (const i18n of parked as RequestScopedInstance[]) {
      await destroyInstance(i18n);
    }
  }

  for (const instancePromise of pending) {
    let i18n: NuxtServerInstance;
    try {
      i18n = await instancePromise;
    } catch {
      continue;
    }
    await destroyInstance(i18n);
  }
}

/**
 * A rejected `destroy()` is reported through the instance's own error channel: the
 * response is written by now, so there is nowhere else for it to go, and
 * throwing here would surface as an unhandled rejection in the server process.
 */
async function destroyInstance(i18n: RequestScopedInstance): Promise<void> {
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

/**
 * Responses already being watched for their end, and contexts whose deferred
 * teardown is already armed. Nitro's `error` hook is `captureError` and can
 * fire many times on one request; without these, each call would add another
 * listener and Node would print `MaxListenersExceededWarning` past ten.
 */
const endWatched = new WeakSet<object>();
const deferralArmed = new WeakSet<object>();

/**
 * How many rounds of "work that registered more work" the teardown follows.
 *
 * The wait re-reads the array, so a background task that reschedules itself
 * would keep the loop — and with it the event and its instances — alive forever,
 * which is the leak this whole mechanism exists to close. At the cap the instances
 * are destroyed anyway and the instance's `onError` is told, because at that point
 * something in the app is looping, not translating.
 */
const MAX_WAIT_ROUNDS = 100;

/** What Nitro's `onRequest` puts on the context. Not ours, so read defensively. */
interface NitroEventContext {
  nitro?: { _waitUntilPromises?: unknown[] };
}

/**
 * Say something on the request's own error channel, through the first instance it
 * built — the channel belongs to the request, not to one locale.
 */
function reportRequestCleanup(contextKey: object, message: string): void {
  const fromRegistry = requestI18nMap.get(contextKey)?.values().next().value;
  if (fromRegistry) {
    void fromRegistry.then(
      (i18n) => {
        i18n.reportError(new Error(message), { source: "request-cleanup" });
      },
      () => {},
    );
    return;
  }

  // A plain page render builds ONLY the app plugin's instance, so that is the whole
  // error channel this request has. Looking in the locale registry alone loses
  // the report.
  const parked = (contextKey as Record<string, unknown>)[REQUEST_HOSTS_KEY];
  const appInstance = Array.isArray(parked)
    ? (parked[0] as RequestScopedInstance | undefined)
    : undefined;
  if (appInstance) {
    try {
      appInstance.reportError(new Error(message), { source: "request-cleanup" });
    } catch {
      // A reporter that throws must not take the teardown with it.
    }
    return;
  }

  // Neither instance exists — a request that never translated. Silent in
  // production on purpose: there is no app error handler to route this to.
  if (process.env.NODE_ENV === "development") {
    console.error(message);
  }
}

/**
 * Wait for the work the request registered with `event.waitUntil()`.
 *
 * `afterResponse` means the response is written, NOT that nothing else holds
 * the event. Nitro keeps two kinds of work running past it under the SAME
 * context: an explicit `event.waitUntil(promise)`, and a cached handler's
 * stale-while-revalidate refresh — which Nitro registers through that same
 * `waitUntil` and runs with the PARENT event's context by identity
 * (`cache.mjs`: `event.context = incomingEvent.context`). Destroying at
 * `afterResponse` would hand that refresh a cleared catalog, and the refresh's
 * body is what goes into the cache.
 *
 * nitropack 2.13.4 offers no public accessor: `_waitUntilPromises` on
 * `context.nitro` is the only storage (declared in its `H3EventContext`
 * augmentation, underscore-private). So it is read defensively — a missing or
 * non-array field just means there is nothing to wait for — and the loop
 * re-reads the array because work settling here can register more, up to
 * {@link MAX_WAIT_ROUNDS}. A task that REJECTS does not block anything:
 * `allSettled` waits for it and moves on — and reports it, because attaching a
 * handler to that promise is also what keeps the rejection away from Nitro.
 */
async function settlePendingWork(event: H3Event, contextKey: object): Promise<void> {
  const pending = (event.context as NitroEventContext | undefined)?.nitro?._waitUntilPromises;
  if (!Array.isArray(pending)) return;
  let settled = 0;
  for (let round = 0; pending.length > settled; round += 1) {
    if (round >= MAX_WAIT_ROUNDS) {
      reportRequestCleanup(
        contextKey,
        `[@comvi/nuxt] event.waitUntil() work was still registering more work after ${MAX_WAIT_ROUNDS} rounds; destroying this request's i18n instances anyway`,
      );
      return;
    }
    const batch = pending.slice(settled);
    settled = pending.length;
    for (const result of await Promise.allSettled(batch)) {
      if (result.status === "rejected") {
        // Attaching a handler is what stops this blocking the teardown, and it
        // is also what hides the rejection from Nitro's own unhandled-rejection
        // capture. Say it here so it is not simply lost.
        reportRequestCleanup(
          contextKey,
          `[@comvi/nuxt] a background task of this request (event.waitUntil) rejected: ${String(result.reason)}`,
        );
      }
    }
  }
}

/**
 * Destroy now, or once the response is over.
 *
 *  - ended: the handler has returned and the body is written, so destroy now.
 *  - not ended: the socket died under a handler that may still be rendering,
 *    and `core.destroy()` clears the catalog. Destroying here hands that render
 *    missing-key output, which a `defineCachedEventHandler` or an `swr` / `isr`
 *    route would then WRITE INTO THE CACHE and serve to everyone. So wait for
 *    the response to end after all, or — if it never does — for one macrotask,
 *    by which time a handler whose remaining work is microtasks has finished.
 *    Whichever comes first wins; `destroyRequestInstances` is idempotent.
 *
 * The residual race is stated in `docs/design/ssr.md`: a handler that yields to
 * a timer or real I/O AFTER an abort can still be torn down under, and its next
 * `getRequestI18n` then throws rather than returning a half-dead instance.
 */
function scheduleTeardown(event: H3Event, contextKey: object): void {
  const res = event.node.res;
  if (res.writableEnded) {
    void destroyRequestInstances(contextKey);
    return;
  }
  if (deferralArmed.has(contextKey)) return;
  deferralArmed.add(contextKey);
  const run = (): void => {
    void destroyRequestInstances(contextKey);
  };
  res.once("finish", run);
  setTimeout(run, 0);
}

/** Nitro's `afterResponse`: the response is written, so only its background work is left. */
export async function destroyAfterResponse(event: H3Event): Promise<void> {
  const contextKey = getContextKey(event);
  await settlePendingWork(event, contextKey);
  scheduleTeardown(event, contextKey);
}

/**
 * Arm the response-end teardown, at the START of Nitro's error handling.
 *
 * Nitro's `error` hook is `captureError` and does NOT mean the request is over:
 * `event.captureError()`, a swallowed `request`-hook throw and a cache
 * read/write failure all reach it on a request that keeps running. So this arms
 * listeners and destroys nothing — the teardown happens when the response
 * actually ends, and never on the macrotask timer, which belongs to the abort
 * case alone.
 *
 * Arming has to happen HERE, not when the hook call finishes, because an error
 * handler may AWAIT — Nitro's error renderer does. If the client disconnects
 * during that await, `close` has already fired by the time a later-armed
 * listener goes on, and a thrown handler never reaches `afterResponse` at all:
 * h3 1.15.11's catch runs `onError` first and returns on `event.handled`,
 * which Nitro's `errorHandler` has just set by sending the response. The instance
 * would be retained for the life of the process.
 *
 * Idempotent: `captureError` can fire many times on one request, and the
 * WeakSet keeps this to one pair of listeners.
 */
export function armRequestTeardown(event: H3Event): void {
  const contextKey = getContextKey(event);
  if (endWatched.has(contextKey)) return;
  endWatched.add(contextKey);
  const res = event.node.res;
  const whenOver = (): void => {
    void destroyAfterResponse(event);
  };
  res.once("finish", whenOver);
  res.once("close", whenOver);
}

/**
 * The late half of the error path: tear down if the response is ALREADY over.
 *
 * Called once the whole error hook call has settled, because
 * `destroyAfterResponse` reads the pending-work array and a later error handler
 * may still add to it. A response that was over before
 * {@link armRequestTeardown} ran — written, or a socket an abort already
 * destroyed — will never emit to those listeners, so this is its only signal.
 * It goes through `destroyAfterResponse` rather than straight to the teardown
 * because a capture can arrive from INSIDE a `waitUntil` task
 * (`event.captureError()`, or Nitro's cache layer capturing a read failure with
 * whatever event it was handed), and that task must finish first. No deadlock:
 * the wait runs on its own chain, so it simply defers.
 */
export function destroyIfResponseOver(event: H3Event): void {
  const res = event.node.res;
  if (res.writableEnded || res.destroyed) {
    void destroyAfterResponse(event);
  }
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
    scheduleTeardown(event, contextKey);
  });
}
