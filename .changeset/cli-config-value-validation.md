---
"@comvi/cli": patch
---

`.comvirc.json` values are now validated on load, so an unsupported `format`, a non-string path or template, or a non-http(s) `apiBaseUrl` fails with a CONFIG_INVALID error naming the field before any request or file write.
