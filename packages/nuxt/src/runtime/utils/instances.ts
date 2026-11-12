import type { H3Event } from "h3";
import type { I18n } from "@comvi/core";

/**
 * The server instances of one request, on its own `event.context`: the page's (the plugin
 * reaches the same object as `nuxtApp.ssrContext.event.context`) and `useTranslation`'s.
 * The module's Nitro plugin ends them with the request. An in-process sub-request is its
 * own event with its own context, so it never shares or ends its caller's instances.
 */
const KEY = "__comvi";

type Context = Record<string, Set<I18n> | undefined>;

export function track<T extends I18n>(event: H3Event, i18n: T): T {
  const context = event.context as Context;
  (context[KEY] ||= new Set()).add(i18n);
  return i18n;
}

/** Destroys every instance of `event`'s request (idempotent: `destroy()` is, and the set empties). */
export function end(event: H3Event | undefined): void {
  const set = (event?.context as Context | undefined)?.[KEY];
  if (!set) return;
  for (const i18n of set) i18n.destroy();
  set.clear();
}
