// The e2e's marker: the app has hydrated (every wait is on a state, never on time).
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("app:suspense:resolve", () => {
    document.documentElement.dataset.hydrated = "";
  });
});
