---
"@comvi/cli": minor
---

**Config discovery stops at your project, instead of walking to the filesystem
root.** `comvi` climbed from the working directory all the way up looking for
`.comvirc.json`, so a stray one in `$HOME` or in a shared CI working directory
was adopted, with whatever `apiKey` it carried.

The walk now stops at the first directory containing `package.json`, the same
bound `.env` discovery has always used.

**A workspace package no longer inherits the repo-root config.** The bound is
the nearest `package.json`, not the project root, so in a pnpm/npm/turbo
monorepo a command run from `apps/web` stops at `apps/web/package.json` and
never sees `.comvirc.json` at the repo root. 0.4.1 found it. This is the one
layout where the new bound changes a working setup, and it fails loudly with
`No .comvirc.json found`.

Two ways to keep a repo-root config: point at it explicitly with
`--config ../../.comvirc.json` (the same fix for a config kept deliberately
above the project root), or add a `.comvirc.json` to the package you run from.
