---
"@comvi/cli": patch
---

`comvi push` gives the commit request five minutes instead of 30 seconds, so the first push of a large catalog no longer reports a timeout for a push the platform then applies. A commit that does time out now says the push may already have been applied and that re-running it is safe. `COMVI_TIMEOUT_MS` sets both the read and the commit timeout in milliseconds; a value that is not a positive whole number exits `4` before any request.
