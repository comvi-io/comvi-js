---
"@comvi/core": patch
---

`cdn()` and `api()` time out even when their `fetch` assigns `signal.onabort` and never answers. The loader settled its load through that same property, so a `fetch` that set it replaced the loader's handler: the load stayed pending past its timeout, `ready` and `load(ns)` never settled and `onError` reported nothing (a caller's abort did not settle it either). The timeout and the caller's abort now settle the load themselves: it rejects with the timeout error (`[@comvi/core/cdn] timeout <ms> ms: <url>`, reported as `load_failed`) as it already did for a `fetch` that ignores its signal or listens with `addEventListener`, and `load(ns)` asks again.
