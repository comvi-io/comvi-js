// The editor-loader slot as @comvi/core 0.5.1 installs it — protocol 1 of
// `contracts/chrome-extension-proxy.json#editorLoader`, written by hand (a slot
// carries a closure, so it cannot be recorded from a build).
//
// FROZEN. This file is the contract: never edit it for protocol 1. A new
// protocol adds a new file next to it, and every future editor runs against
// every file in this directory. `@comvi/core` pins its live slot's keys and
// value types to this literal.
const url =
  "https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js";

export default {
  protocol: 1,
  sdkVersion: "0.5.1",
  editorVersion: "latest",
  url,
  load: () => Promise.resolve({ ok: true, url, sdkVersion: "0.5.1", protocol: 1 }),
};
