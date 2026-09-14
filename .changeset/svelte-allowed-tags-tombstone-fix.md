---
"@comvi/svelte": patch
---

**`<T allowedTags>` is now actually a type error.** `svelte-structural-t.md` already claimed this for
0.5 ("Passing the prop is now a type error"), but `TProps`'s interpolation-param widening
(`TBaseProps & Record<string, unknown>`) let it silently compile and spread into `params` as an
ordinary translation value — nothing caught a leftover 0.4 `<T allowedTags={[...]}>`. `TBaseProps`
now declares `allowedTags?: never` (`@deprecated`, JSDoc explains `<T>` renders structurally and tag
handlers come from `components`), so a typed caller gets a compile error naming the replacement
instead of a silent no-op. A JS caller that still passes the prop at runtime gets it dropped — it is
pulled out before the interpolation-param spread, the same way `raw` is — with a one-time
development-only warning through the same per-host `#dev-warn` channel `<T raw>` uses (a separate
dedupe set, so the two warnings do not suppress each other on the same host).
