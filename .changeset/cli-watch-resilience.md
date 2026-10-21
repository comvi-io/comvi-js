---
"@comvi/cli": patch
---

`comvi typegen --watch` survives a platform deploy and stops loudly when it cannot recover.

- **A lost stream is reopened.** After a 502, a refused connection or a dropped socket, the watcher waits 1, 2, 4… up to 30 seconds between tries and says so. Before, any non-200 ended the stream for good while the watcher kept running, or exited 0 when stdin was closed.
- **A silent stream is replaced.** One that sends nothing for 45 seconds, not even the platform's 15-second ping, is closed and reopened.
- **A rejected key stops the watcher.** A 401 or 403 now exits `3` with the reason instead of retrying forever.
- **SIGTERM** stops the watcher like Ctrl-C (exit `0`), for Docker, systemd and CI runners.
