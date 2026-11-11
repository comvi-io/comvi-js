import { splitPathAndSuffix } from "./locale-path";

/**
 * The locale a `<NuxtLinkLocale locale>` click asked for, kept in memory on the app for the
 * one navigation it started (its target path) until that navigation ends, whether it lands,
 * is superseded or is aborted. Nothing is written to the cookie on the click: the route
 * middleware reads this for a URL that names no locale and records the cookie only after the
 * switch has landed.
 */
interface Pending {
  locale: string;
  path: string;
}
type State = { _comviTarget?: Pending };

export function setTarget(
  nuxtApp: object,
  router: { afterEach(hook: () => void): () => void },
  locale: string,
  path: string,
) {
  const state = nuxtApp as State;
  const pending = (state._comviTarget = { locale, path: splitPathAndSuffix(path).pathname });
  const off = router.afterEach(() => {
    off();
    if (state._comviTarget === pending) delete state._comviTarget;
  });
}

/** The click's locale when `pathname` is the navigation it started, else `undefined`. */
export const targetFor = (nuxtApp: object, pathname: string): string | undefined => {
  const pending = (nuxtApp as State)._comviTarget;
  return pending && pending.path === pathname ? pending.locale : undefined;
};
