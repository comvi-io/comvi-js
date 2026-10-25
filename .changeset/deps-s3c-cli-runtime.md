---
"@comvi/cli": patch
---

`@comvi/cli` now requires Node.js 22.12 or newer (it accepted any Node 22 before): its dependencies commander 15 and eventsource 5, which it now uses, no longer support earlier Node 22 releases. On Node 22.0 to 22.11, update Node before updating the CLI. Commands, options, exit codes and `comvi typegen --watch` (reconnecting, the API key header, stopping on a revoked key) work as before.
