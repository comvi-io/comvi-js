import { splitPathAndSuffix } from "./locale-path";

/**
 * The locale a `<NuxtLinkLocale locale>` click asked for, kept in memory on the app for the
 * navigation it starts. Nothing is written to the cookie on the click: the route middleware
 * reads this for a URL that names no locale and records the cookie only after the switch has
 * landed. It ends with the navigation (landed, aborted, a duplicate, a redirect the
 * middleware issued) or with a guard that threw; a cancelled navigation is followed by the
 * one that superseded it, which ends it.
 */
interface Pending {
  locale: string;
  path: string;
}
type State = {
  _comviTarget?: Pending;
  _comviTargetEnds?: true;
  _comviNavigating?: number;
  _comviNavigation?: number;
  $i18n: { locale: string; setLocale(locale: string): Promise<unknown> };
};
type To = { path: string; redirectedFrom?: { path: string } };
interface RouterLike {
  afterEach(hook: (to: To, from: unknown, failure?: { type: number } | void) => void): unknown;
  onError(hook: () => void): unknown;
}

/** The path without its trailing slash (NuxtLink's `trailingSlash`). */
const bare = (path: string) => splitPathAndSuffix(path).pathname.replace(/(.)\/+$/, "$1");

/**
 * The app's one pair of router hooks, registered by the first switch (the route middleware) or
 * the first locale click, whichever comes first. They end a click's target, and they handle a
 * duplicate: a navigation to the URL on screen, for which the router runs no guard.
 */
export function watchNavigations(nuxtApp: object, router: RouterLike) {
  const state = nuxtApp as State;
  if (state._comviTargetEnds) return;
  state._comviTargetEnds = true;
  // Failure types (vue-router 4 and 5): `8` cancelled keeps the target for the navigation that
  // superseded it; `16` duplicated: the user asked for the URL on screen. A click's own
  // duplicate switches to its locale (the plugin records the cookie when it lands); any
  // duplicate while a switch loads supersedes that switch, as a newer navigation does in the
  // middleware: the pending run records and redirects nothing, the locale on screen stays.
  router.afterEach((to, _from, failure) => {
    if (failure?.type === 8) return;
    // No navigation on a server reaches here: this stays out of the server graph.
    if (!import.meta.server && failure?.type === 16) {
      const locale = targetFor(nuxtApp, to);
      if (locale || state._comviNavigating) {
        state._comviNavigation = (state._comviNavigation ?? 0) + 1;
        state.$i18n.setLocale(locale ?? state.$i18n.locale).catch(() => {});
      }
    }
    delete state._comviTarget;
  });
  router.onError(() => delete state._comviTarget);
}

export function setTarget(nuxtApp: object, router: RouterLike, locale: string, path: string) {
  watchNavigations(nuxtApp, router);
  (nuxtApp as State)._comviTarget = { locale, path: bare(path) };
}

/** The click's locale when `to` (or the route it was redirected from) is its target. */
export const targetFor = (nuxtApp: object, to: To): string | undefined => {
  const pending = (nuxtApp as State)._comviTarget;
  return pending && pending.path === bare((to.redirectedFrom ?? to).path)
    ? pending.locale
    : undefined;
};
