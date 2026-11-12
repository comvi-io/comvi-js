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
  $i18n: { setLocale(locale: string): Promise<unknown> };
};
interface RouterLike {
  afterEach(hook: (to: unknown, from: unknown, failure?: { type: number } | void) => void): unknown;
  onError(hook: () => void): unknown;
}

/** The path without its trailing slash (NuxtLink's `trailingSlash`). */
const bare = (path: string) => splitPathAndSuffix(path).pathname.replace(/(.)\/+$/, "$1");

export function setTarget(nuxtApp: object, router: RouterLike, locale: string, path: string) {
  const state = nuxtApp as State;
  if (!state._comviTargetEnds) {
    state._comviTargetEnds = true;
    // Failure types (vue-router 4 and 5): `8` cancelled keeps the target for the navigation
    // that superseded it; `16` duplicated is a link to the page on screen, where no guard runs:
    // the switch happens here (the plugin records the cookie when it lands).
    router.afterEach((_to, _from, failure) => {
      if (failure?.type === 8) return;
      if (failure?.type === 16 && state._comviTarget)
        state.$i18n.setLocale(state._comviTarget.locale).catch(() => {});
      delete state._comviTarget;
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
