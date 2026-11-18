import type { H3Event } from "h3";
import { end } from "../../utils/instances";

/**
 * The slice of Nitro's app this plugin uses, declared here rather than imported:
 * `nitropack` is nuxt's dependency, not this package's.
 */
interface NitroAppLike {
  hooks: {
    hook(name: "request", fn: (event: H3Event) => void): unknown;
    hook(name: "afterResponse", fn: (event: H3Event) => void): unknown;
    hook(name: "error", fn: (error: Error, context: { event?: H3Event }) => void): unknown;
  };
}

/**
 * Ends every server instance of a request (the page's, `useTranslation`'s) with the
 * request itself: `afterResponse` once the response was sent; `error` when the handler or
 * the page render threw (h3 then skips `afterResponse`); and the response's `close`, which
 * is also how a client that went away before the answer ends it — the render may still be
 * waiting for a load then, and `afterResponse` comes only when it is done. `destroy()`
 * aborts the loads in flight and runs the plugins' teardowns; every path is idempotent.
 */
export default function comviRequestEnd(nitroApp: NitroAppLike): void {
  nitroApp.hooks.hook("request", (event) => {
    event.node?.res?.once?.("close", () => end(event));
  });
  nitroApp.hooks.hook("afterResponse", (event) => end(event));
  nitroApp.hooks.hook("error", (_error, context) => end(context?.event));
}
