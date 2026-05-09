---
"@comvi/cli": patch
---

Fix `ConfigLoader.create()` silently dropping `namespaces` and `locales` when writing config. Previously a load → modify → save round-trip — anything that imports `ConfigLoader.create()` and round-trips a config — would lose the filter fields because `configToWrite` only emitted a fixed list of known keys. Now they're persisted when set (omitted when undefined, so `comvi init` doesn't bake an empty filter into a fresh config).

Also clarifies the README wording about `.env` discovery: the loader walks up from the current working directory, bounded by the project root (the previous text said "from the project root", which was accurate only for the common case of `cwd === project root`).
