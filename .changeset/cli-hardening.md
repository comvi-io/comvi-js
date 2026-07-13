---
"@comvi/cli": patch
---

CLI hardening from the fleet-wide audit:

- `--version` now reports the real package version (was hardcoded `1.0.0`)
- `.comvirc.json` is atomically replaced from an exclusive `0600` temp file when it contains an `apiKey`, so an existing permissive config never exposes the new secret; `comvi init --api-key` prints a warning that argv secrets are visible to `ps` and shell history
- API client: bounded retry with exponential backoff for `429` (honoring both seconds and HTTP-date `Retry-After` values, capped at 30s) and for `5xx`/network errors on idempotent GETs; push commits are never retried after send
- request timeout timers are now cleared in `finally` across all API methods
- translation and type files are written atomically through unique exclusive temp files with failure cleanup, so interrupted or concurrent `pull`/`typegen` operations never share a temp path or leave truncated output
- SSE schema updates are processed serially and queued events are discarded after cleanup or subscription replacement
- `eventsource` is lazily imported only in watch mode, shaving startup cost from every other command
- new `comvi pull --dry-run` flag lists the files a pull would write without touching the filesystem
