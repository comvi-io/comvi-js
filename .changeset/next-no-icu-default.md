---
"@comvi/next": minor
---

**BREAKING (breaking change on a 0.x minor): `createNextI18n` no longer defaults the compiler to `icuCompiler`.** Pass `compiler: icuCompiler` from `@comvi/next` (or `@comvi/core/icu`) if your catalogs use `plural`, `select` or `selectordinal`. It was the last constructor in the repo that turned ICU on by itself, and one host quietly compiling a grammar every other host refuses is the kind of difference that only shows up when an app moves a catalog between them.

Without the option an ICU message is not silently wrong, it is loud: development throws `E_ICU_SYNTAX` at ingestion, naming the option and the specifier, and production renders the braced message literally and reports it once. So the upgrade is a build-time failure in development, not a production surprise.

```diff
-import { createNextI18n } from "@comvi/next";
+import { createNextI18n, icuCompiler } from "@comvi/next";

 export const { i18n, routing } = createNextI18n({
   locales: ["en", "uk"],
   defaultLocale: "en",
+  compiler: icuCompiler,
   messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
 });
```

Every other capability `createNextI18n` composes — ambient tags, the loader with both `registerLoader` overloads, the plugin host, default params, devtools discovery — is unchanged. The CDN global is unchanged too, and stays fully composed: a `<script src>` has no tree-shaking, so there is no byte choice to offer there.
