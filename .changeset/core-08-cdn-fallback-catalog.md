---
"@comvi/core": minor
---

**BREAKING** (against the 0.8 pre-release shorthand): a `cdn(base, { fallback })` entry returns the catalog itself, flat or nested, as a `Loader` does, never a JSON module. Write `de: () => import("./locales/de.json").then((m) => m.default)`. The fallback no longer unwraps an object's `default`, so a catalog with a top-level group named `default` (`{ "default": { "title": … }, "navigation": { … } }`) keeps all its keys (`default.title`, `navigation.home`), and a flat key `default` stays a key. `CdnFallback` is `() => CatalogInput | Promise<CatalogInput>`.
