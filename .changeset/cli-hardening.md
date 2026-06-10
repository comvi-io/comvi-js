---
"@comvi/cli": patch
---

CLI hardening from the fleet-wide audit:

- `--version` now reports the real package version (was hardcoded `1.0.0`)
- `.comvirc.json` is written with `0600` permissions when it contains an `apiKey`; `comvi init --api-key` prints a warning that argv secrets are visible to `ps` and shell history
- API client: bounded retry with exponential backoff for `429` (honoring `Retry-After`, capped at 30s) and for `5xx`/network errors on idempotent GETs; push commits are never retried after send
- request timeout timers are now cleared in `finally` across all API methods
- translation and type files are written atomically (temp file + rename), so an interrupted `pull`/`typegen` never leaves truncated output
- SSE schema updates are processed serially — a burst of updates can no longer interleave concurrent writes to the output file
- `eventsource` is lazily imported only in watch mode, shaving startup cost from every other command
- new `comvi pull --dry-run` flag lists the files a pull would write without touching the filesystem
