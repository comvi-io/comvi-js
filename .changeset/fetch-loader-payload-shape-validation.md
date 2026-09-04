---
"@comvi/plugin-fetch-loader": patch
---

**A malformed API payload is now refused instead of silently becoming junk
translations.** Two levels of the export response went unchecked.

If a namespace's locale map arrived as a string, `Object.entries("ab")` turned
it into entries `0` and `1`, so the loader cached `0:default` and `1:default`
and the real keys were simply missing. The same held for a catalog that came
back as a string, a number or `null`. Both now throw the existing invalid
response error, naming the exact path:

```
[@comvi/plugin-fetch-loader] Invalid API response: "namespaces.default.en" must be an object
```

The project lookup is checked too. Its `id` is interpolated into the export URL
path, so a 200 that is not a project — no `id`, a `null` one, an object, or a
string carrying path segments such as `../..` — is refused rather than turned
into a malformed request:

```
[@comvi/plugin-fetch-loader] Invalid API response from https://api.comvi.io/v1/project: "id" must be a number or a path-safe string
```

That refusal is not retried: asking the same endpoint again cannot change what
it answered.
