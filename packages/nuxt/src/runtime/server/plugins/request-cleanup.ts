import type { H3Event } from "h3";
import { claimRequestCleanup, scheduleRequestCleanup } from "../internal/request-hosts";

/**
 * The slice of Nitro's app this plugin drives, declared here rather than
 * imported: `nitropack` is nuxt's dependency, not this package's, and a strict
 * pnpm layout gives us no way to name it. The signatures mirror nitropack
 * 2.13.4 — `afterResponse: (event, response) => void | Promise<void>` and
 * `error: (error, { event }) => void`.
 */
interface NitroAppLike {
  hooks: {
    hook(name: "afterResponse", fn: (event: H3Event, response?: unknown) => void): void;
    hook(name: "error", fn: (error: Error, context: { event?: H3Event }) => void): void;
  };
}

/**
 * Destroys each request's i18n hosts once Nitro is done with the request.
 *
 * `afterResponse` is the one signal that means BOTH "the handler returned" and
 * "the response is written": h3 1.x calls it after `handleHandlerResponse` for
 * a normal response, and again from `toNodeListener`'s catch for a thrown one.
 * The response's own `close` event only means the socket is gone, which on a
 * client abort is true while the handler is still rendering — so with this
 * plugin installed, `getRequestI18n` hooks nothing and this owns teardown.
 *
 * Why it imports `../internal/request-hosts` and not the server util next to
 * it: nuxt's `impound` plugin refuses a `#build/*` alias anywhere in the nitro
 * runtime graph, and `../utils/request-i18n` imports two of them to build a
 * host. Pulling that module in here fails an app's `nitro` build outright —
 * which is why `test-apps/nuxt` is built as part of this lot's gates.
 *
 * `error` covers what `afterResponse` cannot reach: an error handler that has
 * already sent the response (h3 skips `onAfterResponse` when `event.handled`
 * was set inside `onError`). It can also fire BEFORE the error response is
 * written, which is why it goes through the same scheduler — an unended
 * response defers instead of tearing down under a live handler. Both hooks are
 * idempotent, so a request that reaches both is destroyed once.
 */
export default function comviRequestCleanup(nitroApp: NitroAppLike): void {
  claimRequestCleanup();

  nitroApp.hooks.hook("afterResponse", (event) => {
    scheduleRequestCleanup(event);
  });

  nitroApp.hooks.hook("error", (_error, context) => {
    // Nitro's `captureError` is also called for failures with no request.
    if (context.event) {
      scheduleRequestCleanup(context.event);
    }
  });
}
