---
"@comvi/core": minor
"@comvi/plugin-in-context-editor": minor
"@comvi/react": minor
"@comvi/vue": minor
"@comvi/solid": minor
"@comvi/svelte": minor
---

**BREAKING (breaking change on a 0.x minor): the per-call `raw` option is renamed `markers`, with
the polarity inverted.** `t('meta.title', { raw: true })` becomes `t('meta.title', { markers: false })`.
Core never read the option; its one reader is the in-context editor, which appends invisible
marker characters to every result so it can find the text on the page. `markers: false` keeps
those characters out of this call's result, for text that lands in attributes, `<title>`, emails
or JSON, and the new name says exactly that. Leaving it out, or passing `true`, keeps the markers
as before. `markers` stays a reserved call-control key: it is not an interpolation value, and
`defaultParams` rejects it beside `locale`, `ns`, `fallback` and `tagInterpolation`.

**On `<T>` the prop is `markers` too, in all four bindings.** `<T skipPostProcess>` becomes
`<T markers={false}>` in JSX and `.svelte` markup and `:markers="false"` in `.vue` templates.
`<T>` forwards `markers: false` only when the prop is `false`; `true` or no prop adds nothing, so
a `markers` key in `params` is left as it is. `skipPostProcess` is now an undeclared name, so like
any other undeclared prop it reaches the translation as an interpolation param.
