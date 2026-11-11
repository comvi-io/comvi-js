// A Nitro route using the module's server utility (auto-imported): the locale follows the
// cookie, then Accept-Language; one instance per request and locale.
export default defineEventHandler(async (event) => {
  const { t, locale, dir, i18n } = await useTranslation(event);
  const admin = await useTranslation(event, { ns: "admin" });
  return {
    locale,
    dir,
    home: t("nav.home"),
    adminTitle: admin.t("dashboard"),
    hasHome: i18n.has("nav.home"),
    sameInstance: admin.i18n === i18n,
  };
});
