import { splitPathAndSuffix } from "./locale-path";

/**
 * The locale a `<NuxtLinkLocale locale>` click asked for, kept in memory on the app for the
 * navigation it starts. Nothing is written to the cookie on the click: the route middleware
 * reads this for a URL that names no locale and records the cookie only after the switch has
 * landed. It ends with the navigation (landed, aborted, a duplicate) or with a guard that
 * threw; a cancelled navigation is followed by the one that superseded it, which ends it.
 */
interface Pending {
  locale: string;
  path: string;
}
type State = { _comviTarget?: Pending; _comviTargetEnds?: true };
interface RouterLike {
  afterEach(hook: (to: unknown, from: unknown, failure?: { type: number } | void) => void): unknown;
  onError(hook: () => void): unknown;
}

/** A URL without the trailing slash of its path (NuxtLink's `trailingSlash`). */
export const unslashed = (url: string) => url.replace(/^([^?#]*?[^/])\/+(?=[?#]|$)/, "$1");
const bare = (path: string) => unslashed(splitPathAndSuffix(path).pathname);

export function setTarget(nuxtApp: object, router: RouterLike, locale: string, path: string) {
  const state = nuxtApp as State;
  if (!state._comviTargetEnds) {
    state._comviTargetEnds = true;
    // `8` is `NavigationFailureType.cancelled` (vue-router 4 and 5).
    router.afterEach((_to, _from, failure) => {
      if (failure?.type !== 8) delete state._comviTarget;
    });
    router.onError(() => delete state._comviTarget);
  }
  state._comviTarget = { locale, path: bare(path) };
}

/** The click's locale when `to` (or the route it was redirected from) is its target. */
export const targetFor = (
  nuxtApp: object,
  to: { path: string; redirectedFrom?: { path: string } },
): string | undefined => {
  const pending = (nuxtApp as State)._comviTarget;
  return pending && pending.path === bare((to.redirectedFrom ?? to).path)
    ? pending.locale
    : undefined;
};
