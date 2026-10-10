---
"@comvi/next": minor
---

**Peer ranges are now `next: "^15.0.0 || ^16.0.0"` and `react: "^18.2.0 || ^19.0.0"`.** Next 16 is
added because it was tested; Next 14 is removed as unverified; and the React floor rises to 18.2
because that is the floor every supported Next declares.

Next 16 was blocked by a range that predated it, so `npm install @comvi/next` in a
`create-next-app@latest` app (Next 16.3.5) failed with `ERESOLVE`. It is now supported, on evidence:
the package's own suite (37 files, 418 tests) and all five type programs pass identically on 15.5.9
and 16.3.5, `test-apps/next` type-checks/builds/lints on both, and `check:snippets:types` compiles
all 59 documentation fences against Next 16's own `.d.ts` with the same 19 advisories as on 15. The
surfaces the unit suite mocks were exercised against a real Next 16 server: `createMiddleware` for
all three `NextResponse` verbs (`/` → 307 `/en`, `/uk/pro-nas` → 200 via rewrite, `/uk/about` → 307
→ `/uk/pro-nas`), `getLocale()` reading `x-comvi-locale` through `next/headers`, `createGetPathname`,
`hasLocale`, and every member of `@comvi/next/navigation` including `push`/`replace`/`back`/
`forward`/`refresh`/`prefetch` driven in a browser. Rendered markup was byte-identical to Next 15
across nine routes, and the console was clean.

**`^14.0.0` is dropped as unverified.** Supporting Next 14 is not a third value on one axis — it is a
separate axis, because `next@14.2.35` peers `react: "^18.2.0"` and refuses React 19, so a 14 leg has
to move `react`, `react-dom`, `@types/react` and the `@comvi/react` workspace dependency with it.
Nothing in this repo or its CI has ever run that combination, and an untested combination is not
something a published manifest may assert.

What was observed, on a throwaway install with only `next` swapped: the package's own suite is
**green** on 14.2.35 (37 files, 420 tests, all five type programs, lint, build), but a real app is
not. `test-apps/next` cannot build at all — `Error: Configuring Next.js via 'next.config.ts' is not
supported`, a Next 15 feature — and a probe app with a `next.config.mjs` returns HTTP 500 on every
page:

```
TypeError: Cannot redefine property: I18nProvider
Error: Cannot find module './nextPlugin.js'   (MODULE_NOT_FOUND)
```

after a build-time `Attempted import error: 'I18nProvider' is not exported from
'@comvi/next/client'`. That reproduces on React 18.3.1 as well as 19.2.4, so it is not merely the
React mismatch. It is recorded as a signal, not as the reason: the probe pinned React in one app
while `@comvi/react` stayed on 19, which is not the coherent React 18 tree a real 14 user would
have. Calling Next 14 broken would overstate what was run.

**The route back:** run a 14-on-React-18 leg — `next@14.2.35` with `react`/`react-dom`/`@types/react`
and `@comvi/react` all on React 18, and a `next.config.mjs` fixture. If that passes, `^14.0.0` can
return to the range. Until then the range says only what has been demonstrated.

There are no external users, so the narrowing breaks nobody.

**The React floor is Next's own, not a choice of ours.** Read from the manifests in the worktree:

```
next@14.2.35 -> react: ^18.2.0
next@15.5.9  -> react: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
next@15.5.18 -> react: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
next@16.3.5  -> react: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
```

Every supported Next floors React at 18.2, so the old `react: "^18.0.0 || ^19.0.0"` advertised React
18.0 and 18.1 alongside Next 15 or 16 — a pairing Next refuses, which would hand a reader on React
18.1 an `ERESOLVE` naming _this_ package for a constraint that is Next's. Raised to
`"^18.2.0 || ^19.0.0"`.

**`@comvi/react` and the other bindings keep `^18.0.0` and are untouched.** That floor is ours and it
is correct: `useSyncExternalStore` lands in React 18.0. Only the Next binding inherits Next's 18.2
constraint. In the root README the two install lines sit adjacent —
`@comvi/react  # Peer: react ^18 || ^19` directly above `@comvi/next  # Peers: next …, react ^18.2 ||
^19` — and that difference is deliberate, not drift.

**The declaration sites are now guarded.** `next` was written in four places and `react` in three of
them, with nothing tying any of it together — `scripts/sync-peer-ranges.mjs` only pins internal
`@comvi/*` peers, and `tooling/check-package-contracts.mjs` had no peer logic at all. Both ranges
were wrong at the same time, which is what a guard is for.

`checkNextPeerRangeDeclarations` in that file now treats `packages/next/package.json` as the single
source for **both** peers and fails the gate when a mirror disagrees, when a README's
`# Peers: next …, react …` comment has been renamed away (so it cannot pass by matching nothing),
when the stub's version falls outside the `next` range, or when either range is not a caret union
the prose form can be derived from. It keys on the combined comment naming _both_ peers, so the
adjacent `@comvi/react` and `@comvi/nuxt` install lines cannot be swept up — there is a test for
exactly that. The prose shorthand drops trailing zero components, so `^15.0.0` renders `^15` while
`^18.2.0` keeps its minor as `^18.2`. The stub is checked for satisfaction rather than equality,
because it is pinned to the range's floor on purpose: pinning it to the newest major would stop
proving the lowest supported Next resolves.

Every failure mode was observed red and restored to green before the check was kept — including the
full gate exiting 1 on each of the two axes — and eleven unit tests in
`tooling/check-package-contracts.test.mjs` cover them.
