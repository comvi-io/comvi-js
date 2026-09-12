---
"@comvi/react": minor
"@comvi/svelte": minor
"@comvi/vue": minor
---

**`ComponentMap` is exported from all four binding roots.** The `<T components>` map type was module-private in react (spelled `ComponentsMap`) and vue, so neither app could type a map built outside the JSX; both now export it as `ComponentMap`, matching solid. Svelte's `ComponentMapping` (one entry of the map) is renamed to the internal `ComponentHandler`, as in solid, and is no longer a public name — `ComponentMap` is the export. (The earlier `svelte-component-mapping-target-required` note describes the same entry type under its old name.)
