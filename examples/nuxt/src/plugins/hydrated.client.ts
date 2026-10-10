// Sets <html data-hydrated="true"> once a page has hydrated and is interactive.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("page:finish", () => {
    document.documentElement.dataset.hydrated = "true";
  });
});
