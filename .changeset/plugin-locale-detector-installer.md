---
"@comvi/plugin-locale-detector": minor
---

**Added: `localeDetector(options)` — the lowercase `.with(…)` installer.** `@comvi/core` is
the base host now, so the plugin host is an import you add; the installer composes it and
registers the plugin you already know.

```ts
import { createI18n } from "@comvi/core";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).with(
  localeDetector({ supportedLocales: ["en", "uk", "de"], caches: ["cookie"] }),
);
```

That replaces `createI18n({ … }).with(attachPlugins)` followed by
`i18n.use(LocaleDetector({ … }))`. No loader capability is composed, deliberately: the
detector hands core a locale, it never loads a catalog.

`LocaleDetector` is **unchanged**, and the installer re-implements no lifecycle: `required`,
`timeout`, `onError`, cleanup registration and LIFO destroy keep running inside the plugin
host, because the installer's last act is `use`. Composing onto a host that already has the
capability installs nothing and keeps every plugin already registered. The exported
installer type is `LocaleDetectorInstaller`. Putting one in the other's slot is a type error
and loud at runtime.
