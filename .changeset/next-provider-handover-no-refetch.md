---
"@comvi/next": patch
---

**A client navigation no longer re-fetches the catalog the server just handed over.**
`<I18nProvider>` applied the new locale before adding the messages that came with it, so the
locale switch asked the loader for a catalog that was about to be cached. Every navigation to
another locale sent a duplicate request, and `isLoading` stayed `true` until it answered. Against
a CDN that hangs, the page showed the new language next to "Loading…" for one more full loader
timeout. The provider now adds the messages first.
