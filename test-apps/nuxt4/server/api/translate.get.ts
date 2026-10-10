// A Nitro route using the module's server utilities, all auto-imported:
// `useTranslation(event)` resolves the locale as the route middleware does
// (path prefix, then `localeDetection.order`) and loads that locale's catalog;
// `loadMessages(event, locale)` returns it as plain JSON.
export default defineEventHandler(async (event) => {
  const { t, locale, hasTranslation } = await useTranslation(event);
  const admin = await useTranslation(event, { ns: "admin" });
  const messages = await loadMessages(event, locale);

  return {
    locale,
    home: t("nav.home"),
    adminTitle: admin.t("dashboard"),
    hasHome: hasTranslation("nav.home"),
    catalogs: Object.keys(messages),
    locales: getServerRuntimeConfig(event).public.comvi.locales,
  };
});
