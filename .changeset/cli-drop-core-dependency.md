---
"@comvi/cli": patch
---

Drop unused `@comvi/core` runtime dependency. The CLI never actually imported anything from `@comvi/core` — it only emits the strings `import '@comvi/core'` and `declare module '@comvi/core'` into generated `i18n.d.ts` files for the user's project to compile. Those references resolve in the user's tree (which already has `@comvi/core` via `@comvi/vue` / `@comvi/react` / etc.), so removing the CLI-side dep is safe and shrinks the install footprint by one transitive package.

Not promoted to `peerDependencies` — `peer` would imply the CLI itself needs `@comvi/core` to run, which it doesn't. The generated `.d.ts` is a build artifact whose dependencies are the user's responsibility, not the CLI's.
