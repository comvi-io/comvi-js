---
"@comvi/core": minor
---

`@comvi/core/ssr` is the public way to the server payload: `handover(i18n)` (and its `Handover` type), the same snapshot the bindings reach through `/internal`, so there is one payload format. The React SSR recipe imports it from here. `handover()` now hands its containers over with `Object.prototype`, and a catalog the instance holds prototype-free (a patch flattened after more than 256 added keys) as a plain copy; any other catalog stays the object the instance holds, so a catalog two providers of a request share is written once in the RSC payload (built prototype-free as before; spread and `fromEntries` define own keys, a namespace called `constructor` too): React Server Components refuse a null-prototype prop, so a Next.js page could not pass `handover(i18n)` to a Client Component.
