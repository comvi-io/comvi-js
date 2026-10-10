---
"@comvi/plugin-locale-detector": patch
---

**A detected locale is cached only after `init()` has succeeded with it.** The detector wrote the
cache as soon as the detected locale was applied, which is before the first catalog is requested.
Without `supportedLocales`, a browser language the app has no catalog for was therefore cached and
then failed to load, and every later visit read it back and failed the same way: `?lng=en` lost to
the cached value, and an in-app `setLocale('en')` after the failed init did not rewrite it.

A locale detected during `init()` is now written when `initialized` fires. A `setLocale()` after
init is written at once, as before. When `init()` fails and a load for the locale the detector
read from its own cache has failed, that cached value is removed from every cache target that
still holds it; a value the app wrote over it in the meantime is left alone, and so is the cache
when the instance is destroyed mid-init without a load failure.

Unchanged: with a browser that keeps reporting an unshipped language and no `supportedLocales`,
each visit detects that language again and `init()` fails again. The detector does not pick
another locale on its own; pass `supportedLocales`.
