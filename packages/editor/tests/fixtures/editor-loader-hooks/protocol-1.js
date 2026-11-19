// The editor-loader slot as @comvi/core 0.6.0 installs it — protocol 1 of
// `contracts/chrome-extension-proxy.json#editorLoader`, written by hand (a slot
// carries a closure, so it cannot be recorded from a build).
//
// FROZEN as of the 0.6.0 release. This file is the contract: never edit it for
// protocol 1. A new protocol adds a new file next to it, and every future
// editor runs against every file in this directory. `@comvi/core` pins its
// live slot and every result of its `load()` to these literals: the same own
// keys, the same value types.
const url =
  "https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js";

// What `load()` resolves with, one literal per outcome. Every result carries
// the same seven keys; one that does not apply holds `undefined` and is NOT
// omitted. `message` is reserved by the contract and core 0.6.0 never sets it,
// so no result has that key.
export const results = {
  ok: {
    ok: true,
    url,
    sdkVersion: "0.6.0",
    protocol: 1,
    editorVersion: "0.6.0",
    code: undefined,
    host: undefined,
  },
  // An editor older than 0.6.0 reports no version of its own.
  "ok-editor-before-0.6.0": {
    ok: true,
    url,
    sdkVersion: "0.6.0",
    protocol: 1,
    editorVersion: undefined,
    code: undefined,
    host: undefined,
  },
  "csp-blocked": {
    ok: false,
    url,
    sdkVersion: "0.6.0",
    protocol: 1,
    editorVersion: undefined,
    code: "csp-blocked",
    host: "cdn.jsdelivr.net",
  },
  "load-error": {
    ok: false,
    url,
    sdkVersion: "0.6.0",
    protocol: 1,
    editorVersion: undefined,
    code: "load-error",
    host: "cdn.jsdelivr.net",
  },
  timeout: {
    ok: false,
    url,
    sdkVersion: "0.6.0",
    protocol: 1,
    editorVersion: undefined,
    code: "timeout",
    host: "cdn.jsdelivr.net",
  },
  "no-global": {
    ok: false,
    url,
    sdkVersion: "0.6.0",
    protocol: 1,
    editorVersion: undefined,
    code: "no-global",
    host: "cdn.jsdelivr.net",
  },
  // devtools({ editorVersion }) got something other than an exact version:
  // nothing was requested, so there is no URL.
  "invalid-editor-version": {
    ok: false,
    url: "",
    sdkVersion: "0.6.0",
    protocol: 1,
    editorVersion: undefined,
    code: "invalid-editor-version",
    host: "cdn.jsdelivr.net",
  },
};

export default {
  protocol: 1,
  sdkVersion: "0.6.0",
  editorVersion: "latest",
  url,
  load: () => Promise.resolve(results.ok),
};
