---
"@comvi/core": patch
---

A loader that assigns `signal.onabort` no longer leaves promises waiting forever. The instance settled an aborted load through that same property, so a loader that set it (and never answered) replaced the instance's own handler: `load(ns)` followed by `destroy()`, a `setLocale()` superseded by another, a `setLocale()` pending at `destroy()` and `ready` at `destroy()` never settled. The instance now listens with `addEventListener`, and each of them resolves, as it already did for a loader that ignores its signal or listens with `addEventListener`.
