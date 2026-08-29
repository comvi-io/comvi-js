// Report-only — changing a dynamic module string without inspecting namespace
// property access could leave the removed `createSlimI18n` name behind.
export async function loadComvi() {
  return import("@comvi/react/slim");
}
