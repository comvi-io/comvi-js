import { createSignal } from "solid-js";

// The greeting's `{name}`, shared by every page: "Ada", or `?name=…` from the
// address bar. A parameter is rendered as text, never as markup: try
// `?name=<b>Grace</b>`.
export const [name, setName] = createSignal(
  new URLSearchParams(location.search).get("name") ?? "Ada",
);
