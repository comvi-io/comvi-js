// The greeting's `{name}`: "Ada", or `?name=…` from the address bar. A parameter
// is rendered as text, never as markup: try `?name=<b>Grace</b>`.
export const name = new URLSearchParams(location.search).get("name") ?? "Ada";
