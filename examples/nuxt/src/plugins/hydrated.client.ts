// Marks <html data-hydrated> once a page is interactive, so a browser test can
// wait for hydration instead of guessing with a timeout.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("page:finish", () => {
    document.documentElement.dataset.hydrated = "true";
  });
});
