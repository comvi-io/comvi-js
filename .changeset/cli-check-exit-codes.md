---
"@comvi/cli": minor
---

`comvi typegen --check` now has distinguishable exit codes, and `comvi init` refuses a malformed
`--api-url` instead of writing it.

- **`--check` exit 1 means "outdated", not "something went wrong".** A failed TMS request —
  network blip, expired key, 5xx — used to exit 1, exactly like genuinely stale types, so CI
  could not tell a broken pipeline from real drift. The check now exits **2** and prints
  `✗ Check could not run: …` when the schema request fails (`API_CONNECTION_FAILED`,
  `API_AUTH_FAILED`, `API_FETCH_FAILED`, `API_TIMEOUT`, `API_INVALID_RESPONSE`), keeping **1**
  for a real verdict of outdated. A configuration that fails validation now exits **4**, the
  code `pull` and `push` already used — it also exited 1 before. The `--check` help text
  documents all three.
- **`comvi init -u <not-a-url>` used to blame the API key and write the bad value anyway.**
  `ApiClient` rejected the URL from inside the key-validation block, so the output read
  `⚠ API key validation failed: Invalid API base URL: …` and the config was still created with
  the unusable URL. `init` now validates `--api-url` first, prints `✗ Invalid API base URL: …`
  and exits 4 without writing a config or calling the API.
- Internal: `generate-types` and its `typegen` alias were byte-identical copies of the same
  action and are now built from one implementation, so their flags and behaviour cannot drift.
  The legacy `generate` alias keeps its reduced flag set.
