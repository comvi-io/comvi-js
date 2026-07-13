# Dependency audit triage

Last reviewed: 2026-07-12 (owner: Eugene; re-review by: 2026-10-01 or before
the next package publish, whichever comes first).

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

## How to re-check

```bash
pnpm audit --prod --json | <map findings to dependency roots>
```

Any advisory whose path enters `packages/plugin-fetch-loader` or
`packages/plugin-in-context-editor` blocks release until resolved.
