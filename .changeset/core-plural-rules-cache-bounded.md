---
"@comvi/core": patch
---

The plural-rules cache is now bounded at 1000 entries instead of growing forever.

`getPluralRules()` memoises one `Intl.PluralRules` object per locale in a module-level map that
had no cap and no eviction. The locale it caches under can arrive from `params.locale`, which on
a server usually traces back to an `Accept-Language` header or a URL segment — request-controlled
input. A tag `Intl` rejects was cached too, under the rejected tag, so even nonsense values added
a permanent entry. A long-running SSR process could therefore accumulate unbounded entries from
traffic alone.

The cache now evicts the oldest entry once it holds 1000, the same FIFO bound the `Intl` number,
date and relative-time caches and the template cache already use. Apps stay well under the cap in
normal use: it takes 1000 distinct locales before anything is evicted, and an evicted locale is
simply rebuilt on its next use.
