---
"@comvi/react": patch
---

Fixes two type-level gaps in the `<T components>` config entry form shipped in the previous
release. Type-only; no runtime code changed.

- **A component with REQUIRED props could not be used in a config entry — the exact case `props`
  exists to serve.** The entry reused the bare-handler target type, whose call signature is
  `(params: { children: React.ReactNode }) => React.ReactElement`, so contravariance rejected any
  component declaring a prop beyond `children`:
  `{ btn: { component: Button, props: { tone: 'warn' } } }` failed to compile even though
  `resolvePending` merges those very props before rendering. A config entry's target is now
  deliberately looser than a bare handler's, matching `@comvi/solid`.
- **A config entry must now name a target.** Core's `TagComponentConfig` makes both `tag` and
  `component` optional, so a `{ props: … }` entry with neither type-checked — while
  `isTagComponentConfig` rejects it at runtime and the pipeline forwards the raw object as an
  opaque handler. Exactly one of the two spellings is now required. This narrows what the
  previous release admitted, but only by rejecting an entry that never worked.
