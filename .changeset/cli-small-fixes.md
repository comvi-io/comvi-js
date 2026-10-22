---
"@comvi/cli": patch
---

Smaller CLI fixes:

- **`init` and `COMVI_API_BASE_URL`.** `comvi init` uses `COMVI_API_BASE_URL` when `--api-url` is not given, both to validate the key and in the written config. Before, a staging or self-hosted key was sent to production for validation.
- **Pulling into one file twice.** `comvi pull` refuses (exit `4`), before writing anything, a layout where two catalogs land in the same file. That covers `en` + `US-shop` and `en-US` + `shop` under `{languageTag}-{namespace}.json`, names that differ only in case (they share a file on macOS and Windows), and a namespace whose directory would be another catalog's file. Before, the second catalog silently replaced the first, or the pull failed halfway.
- **Network errors.** They name their cause: `fetch failed (connect ECONNREFUSED 127.0.0.1:9)` instead of only `fetch failed`.
- **`typegen` output.** It says it fetches the schema, and prints each step and failure once instead of twice.
- **`typegen --check` and an unreadable file.** The check reports a declaration file it cannot read (for example a directory at that path) as an error the check could not get past, not as outdated (exit `1`).
