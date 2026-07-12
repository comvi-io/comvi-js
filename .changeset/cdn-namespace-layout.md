---
"@comvi/plugin-fetch-loader": minor
---

Add explicit CDN namespace layout control:

- Existing setups remain unchanged: when `cdnLayout` is omitted, the consumer's `defaultNs` is fetched from the CDN root (`{cdnUrl}/{lang}.json`).
- Set `cdnLayout.rootNamespace` when the namespace stored at the CDN root differs from the consumer's `defaultNs`.
- Set `cdnLayout.rootNamespace: false` when every namespace lives in its own folder (`{cdnUrl}/{ns}/{lang}.json`).
- `buildCdnUrl` accepts the layout as an optional fifth argument, and locale/namespace validation now rejects dot-only path segments.
