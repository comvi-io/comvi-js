import { mount } from "svelte";
import { createI18n } from "@comvi/svelte";
import App from "./App.svelte";
import { booted, options } from "../options.js";

const i18n = createI18n(options());
i18n.ready.then(() => {
  mount(App, { target: document.getElementById("app")!, props: { i18n } });
  booted();
});
