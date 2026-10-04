---
"@comvi/plugin-locale-detector": minor
---

**BREAKING (breaking change on a 0.x minor): the raw plugin factory is renamed `LocaleDetector` → `localeDetectorPlugin`.** It differed from the `localeDetector` installer by one capital, which is not a difference a reader notices and not one a type error explains well. The `Plugin` suffix names the thing you hand to `registerPlugin`.

```diff
-import { LocaleDetector } from "@comvi/plugin-locale-detector";
+import { localeDetectorPlugin } from "@comvi/plugin-locale-detector";

-i18n.registerPlugin(LocaleDetector({ order: ["cookie"] }));
+i18n.registerPlugin(localeDetectorPlugin({ order: ["cookie"] }));
```

The `localeDetector` installer, `LocaleDetectorOptions`, `LocaleDetectorInstaller` and `resolveLocale` keep their names, and behaviour is unchanged. On Next this is also the name inside `nextPlugin(localeDetectorPlugin(…), { runtime: "client" })`, still the only correct way to run the detector on an App Router host. The old names are removed, with no deprecated aliases.
