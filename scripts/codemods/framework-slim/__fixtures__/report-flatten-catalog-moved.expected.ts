// Three ways to reach `flattenCatalog` that the retarget cannot rewrite, and
// all three are already broken on 0.5.0 — so all three are REPORTED. Going
// quiet would certify a tree that cannot build.
import * as comvi from "@comvi/vue";

// A namespace access: the specifier is one string for every member behind it,
// so retargeting it would move the rest of the package with it.
export const merged = comvi.flattenCatalog({ nav: { home: "Home" } });

// An `import()` result: the module record is produced at runtime and the names
// taken off it are not import specifiers at all.
export async function later() {
  const { flattenCatalog } = await import("@comvi/core/loader");
  return flattenCatalog({ footer: { legal: "Legal" } });
}

// A re-export whose clause carries other names: splitting an `export … from`
// is the reader's call, because the names beside it may be type-only.
export { createI18n, flattenCatalog } from "@comvi/svelte";
