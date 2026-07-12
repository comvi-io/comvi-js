---
"@comvi/plugin-locale-detector": minor
---

`cacheFirst` option:

- By default the first cache target is consulted before the detection `order`, so a persisted locale wins over everything, including an explicit query parameter.
- Set `cacheFirst: false` to let `order` fully govern priority — e.g. `order: ["querystring", "localStorage", "navigator"]` makes `?language=fr` override the locale stored on a previous visit, while storage still persists changes and is still read when no stronger source matches.
