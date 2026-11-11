/**
 * Which languages' catalogs the app has now: handed over by the server render, or loaded
 * since. Call the functions in a template that calls `t()`: it re-renders whenever a
 * catalog arrives, so the list follows.
 */
export function useCatalogsInPlace() {
  const { i18n } = useI18n();
  const { locales } = useRouteConfig();
  /** A catalog of `ns` for `locale` is in place (no fallback language counts). */
  const inPlace = (ns: string, locale = i18n.locale) =>
    i18n.has(ns === "default" ? "app.title" : "profile.signed_in", { ns, locale, fallback: false });
  return { locales: () => locales.filter((code) => inPlace("default", code)), inPlace };
}
