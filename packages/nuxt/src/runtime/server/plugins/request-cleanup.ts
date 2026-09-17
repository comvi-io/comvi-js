import type { H3Event } from "h3";
import {
  claimRequestCleanup,
  destroyAfterResponse,
  destroyWhenResponseEnds,
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
    afterEach(fn: (event: NitroHookEvent) => void): unknown;
  };
}

/**
 * Destroys each request's i18n hosts once Nitro is done with the request.
 *
 * It listens through `afterEach` rather than as a named `afterResponse` /
 * `error` handler, because a named handler runs in the MIDDLE of the callHook:
 * another plugin's handler — or Nitro's own stale-while-revalidate
 * registration — sits after ours and calls `event.waitUntil()` there, which a
 * teardown that already read the pending-work array would miss and destroy the
 * host under. `afterEach` fires after every handler of that call has finished,
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
 * Why it imports `../internal/request-hosts` and not the server util next to
 * it: nuxt's `impound` plugin refuses a `#build/*` alias anywhere in the nitro
 * runtime graph, and `../utils/request-i18n` imports two of them to build a
 * host. Pulling that module in here fails an app's `nitro` build outright —
 * which is why `test-apps/nuxt` is built as part of this lot's gates.
 */
export default function comviRequestCleanup(nitroApp: NitroAppLike): void {
  claimRequestCleanup();

  nitroApp.hooks.afterEach(({ name, args }) => {
    if (name === "afterResponse") {
      // Not awaited on purpose: `afterEach` handlers are called and dropped
      // (Hookable ignores what they return), and holding the request open until
      // a stale-while-revalidate refresh finished is not this plugin's call.
      void destroyAfterResponse(args[0] as H3Event);
      return;
    }
    if (name === "error") {
      // Nitro's `captureError` is also called for failures with no request.
      const context = args[1] as { event?: H3Event } | undefined;
      if (context?.event) {
        destroyWhenResponseEnds(context.event);
      }
    }
  });
}
