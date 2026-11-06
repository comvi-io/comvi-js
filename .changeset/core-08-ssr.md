---
"@comvi/core": minor
---

`@comvi/core/ssr` is the public way to the server payload: `handover(i18n)` (and its `Handover` type), the same snapshot the bindings reach through `/internal`, so there is one payload format. The React SSR recipe imports it from here. `handover()` now hands its containers over with `Object.prototype` (built prototype-free as before; spread and `fromEntries` define own keys, a namespace called `constructor` too): React Server Components refuse a null-prototype prop, so a Next.js page could not pass `handover(i18n)` to a Client Component.
