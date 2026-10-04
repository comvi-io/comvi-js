---
"@comvi/plugin-fetch-loader": minor
---

**BREAKING (breaking change on a 0.x minor): the raw plugin factories are renamed to `fetchLoaderPlugin` and `cdnLoaderPlugin`.** They used to differ from their installers by letter case alone — `fetchLoader` composed the capabilities and registered the plugin, `FetchLoader` built a plugin and composed nothing — so one mistyped capital silently changed what a chain did, and the failure surfaced as `E_USE_NOT_INSTALLER` or a missing-capability error rather than as a typo. The `Plugin` suffix says which name is which.

```diff
-import { FetchLoader } from "@comvi/plugin-fetch-loader";
-import { CdnLoader } from "@comvi/plugin-fetch-loader";
+import { fetchLoaderPlugin } from "@comvi/plugin-fetch-loader/api";
+import { cdnLoaderPlugin } from "@comvi/plugin-fetch-loader";

-i18n.registerPlugin(CdnLoader({ cdnUrl }));
+i18n.registerPlugin(cdnLoaderPlugin({ cdnUrl }));
```

`fetchLoader` and `cdnLoader` — the installers you pass to `.use(…)` — keep their names, and so does every option type (`FetchLoaderOptions`, `CdnLoaderOptions`), every installer type and `I18nPluginFactory`. Behaviour is unchanged on both names. No deprecated aliases: 0.5 is unpublished, so the old names are gone rather than soft-landed.
