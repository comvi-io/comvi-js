// The `default` Trusted Types policy a site adds so the devtools() loader can
// assign the editor's jsDelivr URL to `script.src`. Anything else is refused.
window.trustedTypes.createPolicy("default", {
  createScriptURL: (url) => {
    if (url.startsWith("https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@")) return url;
    throw new TypeError("blocked script URL " + url);
  },
});
