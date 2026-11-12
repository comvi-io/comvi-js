// The app's catalog route (the private source): the source, its secret and the access rule
// live here, on the server. `account` is for a signed-in user only (cookie `session=ok`).
const NAMESPACES = ["default", "admin", "account", "hang"];

export default defineEventHandler(async (event) => {
  const { locale, ns } = getRouterParams(event);
  const { locales } = useRuntimeConfig(event).public.comvi;
  // The app's own list: a route parameter never reaches the source unchecked.
  if (!locales.includes(locale!) || !NAMESPACES.includes(ns!))
    throw createError({ statusCode: 404 });
  if (ns === "account" && getCookie(event, "session") !== "ok")
    throw createError({ statusCode: 401 });
  const { comviSource, comviToken } = useRuntimeConfig(event);
  return $fetch(`${comviSource}/${ns}/${locale}.json`, {
    headers: { authorization: `Bearer ${comviToken}` },
    retry: 0,
  });
});
