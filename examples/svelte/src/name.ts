import { writable } from "svelte/store";

// The greeting's `{name}`, shared by every page: "Ada", or `?name=…` from the
// address bar. A parameter is rendered as text, never as markup: try
// `?name=<b>Grace</b>`.
export const name = writable(new URLSearchParams(location.search).get("name") ?? "Ada");
