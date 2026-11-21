// A page the extension must not drive (map D1): `?shape=` picks what `window.__COMVI__`
// holds. Every member of every instance and handle is a spy that records into
// `window.__CALLS__`, and the 0.7 editor-loader slot is planted too: the gate asserts none of
// them is called, that the global is the same array with the same entries afterwards, and
// that no script and no global were added. The page's own behaviour (a counter) must keep
// working.
const calls = [];
const spy = (name) => () => void calls.push(name);
const instance = { t: spy("i.t"), add: spy("i.add"), on: spy("i.on"), destroy: spy("i.destroy") };
const handle = (override) => ({
  p: 2,
  kind: "comvi",
  read: spy("x.read"),
  state: spy("x.state"),
  mark: spy("x.mark"),
  load: spy("x.load"),
  ...override,
});

globalThis[Symbol.for("comvi.devtools.editorLoader")] = {
  protocol: 1,
  sdkVersion: "0.7.1",
  load: spy("slot.load"),
};

const shapes = {
  // @comvi/core 0.5–0.7: `{ v, i }`, no protocol 2 handle.
  old: () => [{ v: "0.7.1", i: instance }],
  // The v1 registry of 0.4–0.5.
  registry: () => ({
    version: "0.4.0",
    instances: new Map([["comvi-1", instance]]),
    register: spy("registry.register"),
    unregister: spy("registry.unregister"),
    get: spy("registry.get"),
  }),
  // The 0.7 editor's and extension's hook: an array carrying its marker and own members.
  hook: () =>
    Object.assign([{ v: "0.7.1", i: instance }], {
      __comviEditorHook: true,
      instances: new Map([["comvi-1", instance]]),
      push: spy("hook.push"),
      get: spy("hook.get"),
    }),
  // A handle from a newer protocol, and one from another library.
  p3: () => [{ v: "0.9.0", i: instance, x: handle({ p: 3 }) }],
  kind: () => [{ v: "0.8.0", i: instance, x: handle({ kind: "other-i18n" }) }],
};

const shape = new URLSearchParams(location.search).get("shape");
window.__COMVI__ = shapes[shape]();
window.__CALLS__ = calls;
window.__BOOT__ = {
  queue: window.__COMVI__,
  entries: Array.isArray(window.__COMVI__) ? [...window.__COMVI__] : [],
  globals: Object.getOwnPropertyNames(window),
  scripts: [...document.scripts].map((script) => script.src),
};

document.getElementById("A-title").textContent = "An app on another protocol";
document.getElementById("counter").addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.dataset.count = String(Number(button.dataset.count || "0") + 1);
});
document.body.dataset.booted = "true";
