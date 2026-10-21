---
"@comvi/cli": patch
---

`comvi push` reports what the platform actually did. Before, "Updated" counted the conflicts kept on the platform in `keep` mode and was 0 after a real overwrite.

- **Summary.** It shows keys created and values new, changed and kept on the platform.
- **Locales not imported.** It warns about local locales the platform did not import, because the project lacks them or the API key may not write them. On a platform that predates these counts, it prints only the number of keys created.
- **Dry run.** `--dry-run` counts values ("New values", "Changed values") instead of calling them keys.
- **Progress line.** The `Progress:` line is gone; the push is a single request.

Access-denied errors keep the platform's reason (a missing scope, a plan limit, read-only billing) and name the scope the command needs: `schema:read` for `typegen`, `translations:read` for `pull`, `translations:write` for `push`. A validation error without a message shows its code and field.

`PushResult` gains `valuesCreated`, `skippedLocales` and `detailed`, and `updated` now counts changed values.
