---
"@comvi/react": patch
---

`useSetLocaleTransition()` now reports `isPending` under React StrictMode.

StrictMode mounts a component, runs its effect cleanups, then mounts it again. The hook's
"am I still mounted?" flag was set once when the ref was created and only ever cleared, so the
double-mount left it stuck at `false` for the rest of the session. Every later `setLocale()` then
skipped its pending updates: the switch still worked, but `isPending` never went true, so spinners
and disabled language buttons never appeared. Apps that render their tree in `<StrictMode>` — the
default in a new Next.js or Vite app in development — saw this on every locale switch.

The flag is now re-armed on each effect run. The real unmount case is unchanged: no state update
happens after the component goes away.
