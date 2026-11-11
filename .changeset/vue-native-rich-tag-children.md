---
"@comvi/vue": patch
---

`<T :components="{ b: 'strong' }">` renders the tag's content on every supported Vue. A tag name (or `{ component: "strong", props }`) is now given its content as children; on Vue 3.5.0–3.5.38 it was given a function, which those versions do not render for an element, so the `<strong>` came out empty on the client, in SSR and after hydration. A component given as the tag still gets the content as its default slot.
