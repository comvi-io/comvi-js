---
"@comvi/cli": patch
---

Smaller CLI fixes:

- **`init` and `COMVI_API_BASE_URL`.** `comvi init` uses `COMVI_API_BASE_URL` when `--api-url` is not given, both to validate the key and in the written config. Before, a staging or self-hosted key was sent to production for validation.
- **Pulling into one file twice.** `comvi pull` refuses (exit `4`) a `fileTemplate` under which two catalogs resolve to the same file, such as `en` + `US-shop` and `en-US` + `shop` with `{languageTag}-{namespace}.json`, before writing anything. Before, the second silently replaced the first.
- **Network errors.** They name their cause: `fetch failed (connect ECONNREFUSED 127.0.0.1:9)` instead of only `fetch failed`.
- **`typegen` output.** It says it fetches the schema, and prints a failure once instead of twice.
- **`typegen --check` and an unreadable file.** The check reports a declaration file it cannot read (for example a directory at that path) as an error. It no longer calls it outdated.
