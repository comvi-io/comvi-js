// Lifecycle e2e: a load that never answers is still in flight when the response is sent.
export default defineEventHandler(async (event) => {
  const { i18n } = await useTranslation(event);
  void i18n.load("hang").catch(() => {});
  return { ok: true };
});
