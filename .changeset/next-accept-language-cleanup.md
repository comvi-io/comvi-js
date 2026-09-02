---
"@comvi/next": patch
---

Internal cleanup, behavior-preserving: the middleware's `Accept-Language` parser drops the two
shadowed defaults in its quality parsing — the `q = "q=1"` destructuring default and the `|| "1"`
inside the `parseFloat` call. Both were unreachable as defaults: anything non-numeric already
falls through to the `isNaN(quality) ? 1 : quality` backstop, which is now the single source of
the "most preferred" default. An entry with no `;q=` part, a bare `;q`, and an unparsable
`;q=nonsense` all still resolve to quality 1, and `;q=0` is still refused.
