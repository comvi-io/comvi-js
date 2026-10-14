// A site on @comvi/core 0.5.0: it announces its instance on window.__COMVI__
// (discovery protocol v2) and installs no editor-loader hook — that arrived in
// 0.6.0. The instance is a stand-in; nothing is ever activated on this page.
window.__COMVI__ = [{ v: "0.5.0", i: { instanceId: "comvi-1" } }];
