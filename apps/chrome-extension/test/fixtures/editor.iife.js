// Packaging-only editor fixture for the fast extension commit gate.
// Cross-repository compatibility and release gates replace this path with the
// exact standalone.iife.js artifact built from js-sdk.
(() => {
  globalThis.__COMVI_EDITOR_PACKAGING_FIXTURE__ = true;
})();
