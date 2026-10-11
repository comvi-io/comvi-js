// An honest Comvi site for Gate E: the real @comvi/core global build
// (`/__core.js`), whose instance composes devtools. Constructing one announces
// it on window.__COMVI__ and installs the editor-loader hook. No inline script
// or style anywhere, so the page works under a strict Content-Security-Policy.

window.__CSP_VIOLATIONS__ = [];
document.addEventListener("securitypolicyviolation", (event) => {
  window.__CSP_VIOLATIONS__.push({
    directive: event.effectiveDirective,
    blockedURI: event.blockedURI,
  });
});

window.__SITE_I18N__ = new window.ComviCore.I18n({
  locale: "en",
  collectContext: false,
  messages: { en: { "gate.select": "Gate E site" } },
});

// The editor marks a string only once it is active, so the spec renders the
// heading again after enabling it.
window.renderGreeting = () => {
  document.getElementById("greeting").textContent = window.__SITE_I18N__.t("gate.select");
};
window.renderGreeting();
