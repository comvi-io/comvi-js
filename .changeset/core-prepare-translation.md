---
"@comvi/core": minor
---

New `prepareTranslation(i18n, props)` — the shared `<T>` pipeline, on the pure
`@comvi/core/rich-text` seam. It absorbs the plumbing the vue / react / solid / svelte
wrappers each used to duplicate: marker-based handler transport, `childrenToArray`,
reserved-prop forwarding (`ns` / `locale` / `fallback` / `raw` override same-named `params`
keys only when defined) and the missing-translation check. It passes the tag syntax
extension **per call**, so `<T>` rendering never depends on ambient registration or import
order. `@comvi/core/tags` re-exports it unchanged beside that registration, and every
framework `<T>` imports the pure seam.

Supporting this, `TranslationParams` gains a reserved `tagInterpolation` key: per-call
tag-interpolation options merged over the instance-level option for that call only
(`extensions` are unioned, other fields override). It joins `ns` / `locale` / `fallback` /
`raw` as a call-control key, and is rejected in `defaultParams`.
