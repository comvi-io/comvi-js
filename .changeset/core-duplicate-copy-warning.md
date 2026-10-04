---
"@comvi/core": patch
---

**Development now tells you when two versions of `@comvi/core` are loaded.**

A framework binding depends on an exact `@comvi/core` version. Install
`@comvi/core` yourself at a different patch and your app ends up with two
copies — and everything core keeps at module scope belongs to one copy each:
ambient tag registration from `@comvi/core/tags`, the `window.__COMVI__`
devtools handshake, and the template cache. Half the app then behaves as if the
feature was never registered, silently.

The copy that loads second now says so once, naming both versions:

```
[@comvi/core] Two copies of @comvi/core are loaded, 0.4.0 and 0.5.0. Ambient tags
(@comvi/core/tags), the window.__COMVI__ devtools handshake and the template
cache belong to one copy each and will not be shared. Align the @comvi/core
version your framework binding depends on with the one you installed directly.
```

The check compares versions, so re-evaluating the same copy — which a test
runner resetting its module registry and a dev server rebuilding a module graph
both do routinely — says nothing. Two copies at the _same_ version are not
reported either.

Development only. Production ships neither the check nor the message, and the
measured production size is unchanged.
