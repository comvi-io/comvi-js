import type { H3Event } from "h3";
import {
  armRequestTeardown,
  claimRequestCleanup,
  destroyAfterResponse,
  destroyIfResponseOver,
} from "../internal/request-hosts";

/**
 * The slice of Nitro's app this plugin drives, declared here rather than
 * imported: `nitropack` is nuxt's dependency, not this package's, and a strict
 * pnpm layout gives us no way to name it.
 *
 * `afterEach` is Hookable's own spy seam (hookable 5.5.3, the version nitro
 * depends on): it fires once per `callHook` / `callHookParallel`, after the
 * whole call has settled, with `{ name, args }` — and `args` are the hook's own
 * arguments, because the task caller shifts the name off the array the event
 * holds by reference.
 */
interface NitroHookEvent {
  name: string;
  args: unknown[];
}

interface NitroAppLike {
  hooks: {
    hook(name: "error", fn: (error: Error, context: { event?: H3Event }) => void): unknown;
    afterEach(fn: (event: NitroHookEvent) => void): unknown;
  };
}

/**
 * Destroys each request's i18n instances once Nitro is done with the request.
 *
 * It listens for `afterResponse` through `afterEach` rather than as a named
 * handler, because a named handler runs in the MIDDLE of the callHook:
 * another plugin's handler — or Nitro's own stale-while-revalidate
 * registration — sits after ours and calls `event.waitUntil()` there, which a
 * teardown that already read the pending-work array would miss and destroy the
 * instance under. `afterEach` fires after every handler of that call has finished,
 * so the array is complete when the wait starts.
 *
 * `afterResponse` means both "the handler returned" and "the response is
 * written", which the response's own `close` event does not: on a client abort
 * `close` is true while the handler may still be rendering. So with this plugin
 * installed, `getRequestI18n` hooks nothing and this owns teardown. What
 * `afterResponse` does NOT mean is that nothing else holds the event, hence the
 * wait for `event.waitUntil` work inside `destroyAfterResponse`.
 *
 * `error` is the ONLY signal a thrown handler gives: h3 skips
 * `onAfterResponse` entirely once `onError` has sent the response, which is
 * what Nitro's `errorHandler` does. But that hook is Nitro's `captureError`,
 * which also fires for errors that leave the request running, so it waits for
 * the response to actually end rather than scheduling anything. Both paths are
 * idempotent, so a request that reaches both is destroyed once.
 *
 * It imports `../internal/request-hosts` and not the server util next to it:
 * the registry is all it needs, and `../utils/request-i18n` also imports the
 * generated instance and setup modules (`#comvi/*`) to build an instance.
 */
export default function comviRequestCleanup(nitroApp: NitroAppLike): void {
  claimRequestCleanup();

  // A NAMED hook for `error`, deliberately: this one must run BEFORE any other
  // error handler gets a chance to await, or a client that disconnects during
  // that await has already emitted `close` by the time the listener goes on.
  // It only arms listeners, so running early costs nothing.
  nitroApp.hooks.hook("error", (_error, context) => {
    // Nitro's `captureError` is also called for failures with no request.
    if (context.event) {
      armRequestTeardown(context.event);
    }
  });

  nitroApp.hooks.afterEach(({ name, args }) => {
    if (name === "afterResponse") {
      // Not awaited on purpose: `afterEach` handlers are called and dropped
      // (Hookable ignores what they return), and holding the request open until
      // a stale-while-revalidate refresh finished is not this plugin's call.
      void destroyAfterResponse(args[0] as H3Event);
      return;
    }
    if (name === "error") {
      // The other half of the error path, late on purpose: the teardown reads
      // the pending-work array, and a later error handler may still add to it.
      const context = args[1] as { event?: H3Event } | undefined;
      if (context?.event) {
        destroyIfResponseOver(context.event);
      }
    }
  });
}
