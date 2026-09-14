# Dependency audit triage

Last reviewed: 2026-07-12 (owner: Eugene).

Re-review due: **before the 0.5.0 publish**, and by 2026-10-01 at the latest.
0.5.0 is the next publish, so the publish is the binding deadline. The delta an
owner needs for that review is prepared below under "2026-09 re-review"; it is
a reading list, not a review, and nothing in it has been signed off.

## Publishable packages — clean

`pnpm audit --prod` findings were mapped to their dependency roots. **No
advisory roots in `packages/plugin-fetch-loader` or
`packages/plugin-in-context-editor`** — the two packages that ship to users
(including inside the Chrome extension bundle). Their runtime dependency
paths carry no known critical/high vulnerabilities.

## Remaining workspace findings — demo/test apps only

All 84 workspace findings (37 production-graph) root exclusively in
`test-apps/*` — local demo applications that are never published and never
run in production:

| Root                                | Advisories                                                                                                                                                                                | Notes                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `test-apps/nuxt`, `test-apps/nuxt4` | `shell-quote` (critical, GHSA-w7jw-789q-3m8p), `nuxt`/`@nuxt/nitro-server` (high/moderate/low), `vite` (high/moderate), `ws`, `devalue`, `tar`, `launch-editor`, `esbuild`, `@babel/core` | Dev-server/build tooling of the Nuxt demos. |
| `test-apps/react`                   | `react-router` (3× high, moderate, low)                                                                                                                                                   | Demo app router.                            |
| `test-apps/next`                    | `postcss` (moderate)                                                                                                                                                                      | Demo app build tooling.                     |

Risk: these packages execute only on developer machines running the demo
apps. They cannot reach library consumers.

Remediation ticket: upgrade the demo apps' Nuxt/Next/react-router/Vite
versions in a dedicated dependency-update wave (kept separate from
security-boundary changes so the security diff stays auditable).

## 2026-09 re-review — PREPARED FOR OWNER REVIEW, NOT SIGNED OFF

Prepared 2026-09-03 by an agent, for the owner pass the header above requires
before the 0.5.0 publish. **This is not an audit.** No `pnpm audit --prod` was
run for it, no finding here was verified against an advisory database, and no
owner has read it. It exists so the required review starts from a list instead
of from a diff of 186 commits.

### Dependency surface — what to re-measure

- Both packages that ship to end users still declare **zero runtime
  `dependencies`**; their only peer is `@comvi/core`. The July conclusion
  ("no advisory roots in the two shipped packages") rests on that same
  structural fact, but it has not been re-run against current advisories.
- **28 commits touched a `package.json` or the lockfile** since 2026-07-12, all
  in dev/test tooling as far as the manifests show. The July counts — 84
  workspace findings, 37 in the production graph — are therefore stale and must
  be re-measured, not carried forward.
- **No new publishable package.** The two packages 0.5 extracted for shared
  code (`packages/locale-routing`, `packages/typegen`) are workspace-private:
  they publish no tarball, and their code reaches npm only inside the consumers
  that inline it. The publishable set is unchanged at 12 names, so the
  release-blocking rule in "How to re-check" needs no new entry — but the audit
  of those 12 now has to cover the inlined code as part of its host package.

### Code paths the owner must read

These are new destructive or outbound-request paths in 0.5, not dependency
findings. They arrive with lots D and E of the 0.5 fix plan; read the merged
code, not this description.

1. **fetch-loader retry** (`packages/plugin-fetch-loader/src/retry.ts`, new).
   Bounded retry on the browser CDN and API paths: 2 retries, on 429/5xx and
   network errors only. It is the first code in the library that issues more
   outbound requests than the caller asked for, so read it for request
   amplification against a failing or hostile CDN, for the handling of the
   server-supplied `Retry-After` (seconds only, capped, and skipped when it
   exceeds the remaining budget), and for abort behaviour — a cancelled locale
   switch must stop the sequence rather than sleep and fetch again. It must not
   retry the timeout error and must not retry a 404, which on the API path
   selects the legacy export URL.
2. **`comvi pull --empty-dir`, scoped clear**
   (`packages/cli/src/services/TranslationSync.ts`,
   `packages/cli/src/commands/pull.ts`). This is the CLI's only destructive
   filesystem path. Two changes: the clear now runs **after** a successful
   fetch rather than before it, and with `--ns`/`--locale` it deletes only the
   files in that scope instead of the whole directory. The scoped clear is a
   different algorithm — a directory walk with per-file unlink — so the
   existing guard against clearing the cwd, a `..` path or an absolute path
   must be confirmed to still cover it, and a namespace directory must be
   removed only once it is empty.
3. **Chrome extension 0.5.0** (`apps/chrome-extension`). Not published to npm,
   but it ships to users through the Web Store and is the widest-reaching
   surface here: `activeTab`, `scripting` and `storage`, host permission for
   `https://api.comvi.io/*`, and two content scripts matching `<all_urls>`.
   The breadth is deliberate, and the reasoning belongs in this review rather
   than only in the store listing.

### Suggested order for the owner pass

1. Re-run the dependency mapping below and record the new counts.
2. Read the three code paths above against the merged 0.5 code.
3. Replace this section with a dated, signed conclusion and update the header.

## How to re-check

```bash
pnpm audit --prod --json | <map findings to dependency roots>
```

Any advisory whose path enters `packages/plugin-fetch-loader`,
`packages/plugin-in-context-editor` or `packages/locale-routing` blocks release
until resolved.
