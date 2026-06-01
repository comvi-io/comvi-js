---
"@comvi/next": patch
---

Re-export the v0.3 selector hooks from `@comvi/next/client`.

`useLocale`, `useIsLoading`, `useSetLocaleTransition`, and `useFormatters` (plus the
`UseSetLocaleTransitionReturn` and `UseFormattersReturn` types) are now re-exported
from `@comvi/next/client`, matching `@comvi/react`. Previously these headline v0.3
hooks were only reachable by adding a separate `@comvi/react` dependency, despite
`@comvi/next/client` being the documented import path for Next apps.
