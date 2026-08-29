---
"@comvi/core": minor
---

`@comvi/core` is compiled with `useDefineForClassFields: false` — a smaller bundle on every
entry, with no logic change.

**Behaviour is identical. Reflection is not**, in two ways, and both matter only if you
enumerate or serialize an instance:

1. **A declared-but-unassigned field is no longer an own property.** The one public member
   this is observable on is `instanceId`: on an instance that never exposed itself
   (`exposeGlobal: false`, or any server render) `Object.keys(i18n)` and `{ ...i18n }` no
   longer list it, where they used to list it holding `undefined`. `i18n.instanceId` still
   reads `undefined`.
2. **Own-property order is assignment order**, not declaration order — the same sequence as
   before for the public keys, so a consumer reading them positionally sees no change.

Every public method and accessor is still a non-enumerable prototype member with unchanged
descriptors, and a spread copy still carries data only.
