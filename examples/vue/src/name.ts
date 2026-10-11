import { ref } from "vue";

// One name for the whole app: the greeting edits it, the Account page reads it.
// It starts as `?name=…` from the address bar, or "Ada". Try
// `?name=<b>Grace</b>`: a parameter is always rendered as text.
const name = ref(new URLSearchParams(location.search).get("name") ?? "Ada");

export function useVisitorName() {
  return name;
}
