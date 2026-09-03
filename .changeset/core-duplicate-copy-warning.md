---
"@comvi/core": patch
---

**Development now tells you when two copies of `@comvi/core` are loaded.**

A framework binding depends on an exact `@comvi/core` version. Install
`@comvi/core` yourself at a different patch and your app ends up with two
copies — and everything core keeps at module scope belongs to one copy each:
ambient tag registration from `@comvi/core/tags`, the `window.__COMVI__`
devtools handshake, and the template cache. Half the app then behaves as if the
feature was never registered, silently.

The copy that loads second now says so once:

```
[i18n] Detected two copies of @comvi/core in one app. Ambient tags
(@comvi/core/tags), the window.__COMVI__ devtools handshake and the template
cache belong to one copy each and will not be shared. Align the @comvi/core
version your framework binding depends on with the one you installed directly.
```

Development only. Production ships neither the check nor the message, and the
measured production size is unchanged.
