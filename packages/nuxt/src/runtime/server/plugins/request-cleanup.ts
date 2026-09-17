import type { H3Event } from "h3";
import {
  claimRequestCleanup,
  destroyAfterResponse,
  destroyWhenResponseEnds,
} from "../internal/request-hosts";

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
 * `afterResponse` means both "the handler returned" and "the response is
 * written", which the response's own `close` event does not: on a client abort
 * `close` is true while the handler may still be rendering. So with this plugin
 * installed, `getRequestI18n` hooks nothing and this owns teardown. What
 * `afterResponse` does NOT mean is that nothing else holds the event, hence the
 * wait for `event.waitUntil` work inside `destroyAfterResponse`.
 *
 * Why it imports `../internal/request-hosts` and not the server util next to
 * it: nuxt's `impound` plugin refuses a `#build/*` alias anywhere in the nitro
 * runtime graph, and `../utils/request-i18n` imports two of them to build a
 * host. Pulling that module in here fails an app's `nitro` build outright —
 * which is why `test-apps/nuxt` is built as part of this lot's gates.
 *
 * `error` is the ONLY signal a thrown handler gives: h3 skips
 * `onAfterResponse` entirely once `onError` has sent the response, which is
 * what Nitro's `errorHandler` does. But that hook is Nitro's `captureError`,
 * which also fires for errors that leave the request running, so it waits for
 * the response to actually end rather than scheduling anything. Both hooks are
 * idempotent, so a request that reaches both is destroyed once.
 */
export default function comviRequestCleanup(nitroApp: NitroAppLike): void {
  claimRequestCleanup();

  // Not awaited on purpose: Nitro awaits this hook, and the teardown waits for
  // the request's own background work, so returning the promise would hold the
  // request handler open until a stale-while-revalidate refresh finished.
  nitroApp.hooks.hook("afterResponse", (event) => {
    void destroyAfterResponse(event);
  });

  nitroApp.hooks.hook("error", (_error, context) => {
    // Nitro's `captureError` is also called for failures with no request.
    if (context.event) {
      destroyWhenResponseEnds(context.event);
    }
  });
}
