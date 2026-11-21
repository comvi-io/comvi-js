// The `default` Trusted Types policy a site adds so the core's x.load() can assign the
// editor's jsDelivr URL to `script.src`. Anything else is refused.
window.trustedTypes.createPolicy("default", {
  createScriptURL: (url) => {
    if (url.startsWith("https://cdn.jsdelivr.net/npm/@comvi/editor@")) return url;
    throw new TypeError("blocked script URL " + url);
  },
});
