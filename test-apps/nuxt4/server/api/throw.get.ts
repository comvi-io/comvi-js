// Lifecycle e2e: the handler throws while a load is in flight.
export default defineEventHandler(async (event) => {
  const { i18n } = await useTranslation(event);
  void i18n.load("hang").catch(() => {});
  throw createError({ statusCode: 500, statusMessage: "e2e" });
});
