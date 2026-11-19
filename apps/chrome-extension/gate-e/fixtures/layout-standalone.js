// The plain-page marker layout check (layout-engines.spec.ts, playwright.engines.config.ts):
// the same layout cases, marked by the editor's own build — `dist/standalone.iife.js`, served by the mock
// server at /editor/ — activated directly, with no extension and no API. Runs after
// fixtures/layout.js (module scripts run in document order).
await new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.src = "/editor/standalone.iife.js";
  script.onload = resolve;
  script.onerror = reject;
  document.head.append(script);
});
const result = window.ComviInContextEditor.activate({ refreshMessages: false });
document.body.dataset.marking = String(result.ok);
