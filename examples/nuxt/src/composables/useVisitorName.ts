// The visitor's name, shared by every page: it starts from `?name=…` in the
// address bar (or "Ada") and then follows the greeting card's input.
// `useState` carries the server's starting value into the browser.
export function useVisitorName() {
  const route = useRoute();
  return useState("name", () => (typeof route.query.name === "string" ? route.query.name : "Ada"));
}
