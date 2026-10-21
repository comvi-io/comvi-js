---
"@comvi/cli": patch
---

`comvi push` gives the commit request five minutes instead of 30 seconds, so the first push of a large catalog no longer reports a timeout for a push the platform then applies. A commit that does time out now says the push may already have been applied and that re-running it is safe.

`COMVI_TIMEOUT_MS` sets the read timeout in milliseconds and can only lengthen the commit, never shorten it below five minutes. A value that is not a whole number from 1 to 2147483647 exits `4` before any request.

`ApiClient` takes a `commitTimeout` option. A caller that passes only `timeout` keeps the old behaviour: that value covers the commit too.
