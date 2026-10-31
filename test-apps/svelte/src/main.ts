import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";
import { i18n } from "$lib/i18n";

// Mount once the first catalogs are in: no frame shows a raw key.
i18n.ready.then(() => mount(App, { target: document.getElementById("app")! }));
