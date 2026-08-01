// Wrapper tarballs (@comvi/react, @comvi/vue) bundled from their packed
// artifacts. Wrapper <T> rendering itself needs a framework renderer + DOM,
// so it is NOT exercised here (documented skip — the string-API and
// sideEffects assertions are the load-bearing part of this gate). What this
// fixture pins:
//   - both wrapper tarballs resolve through their published exports maps and
//     their module graphs execute in plain node;
//   - the shared @comvi/core instance inside the wrapper graph still has
//     ambient tag registration (root-entry side effect survives a larger,
//     sideEffects:false wrapper graph around it).
import { createI18n } from "@comvi/core";
import * as reactWrapper from "@comvi/react";
import * as vueWrapper from "@comvi/vue";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

// React/Vue components may be memo/forwardRef/defineComponent exotic objects.
const isComponent = (c) => typeof c === "function" || (typeof c === "object" && c !== null);
assert(typeof reactWrapper.useI18n === "function", "@comvi/react exports useI18n");
assert(isComponent(reactWrapper.T), "@comvi/react exports T");
assert(typeof vueWrapper.useI18n === "function", "@comvi/vue exports useI18n");
assert(isComponent(vueWrapper.T), "@comvi/vue exports T");

const i18n = createI18n({
  locale: "en",
  translation: { en: { msg: "a <b>c</b> d" } },
});
assert(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }) === "a *c* d",
  "string-API tags still render inside the wrapper module graph",
);

console.log("BUNDLER_MATRIX_OK wrappers");
