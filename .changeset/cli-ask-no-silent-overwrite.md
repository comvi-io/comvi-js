---
"@comvi/cli": patch
---

`comvi push --force-mode ask` no longer overwrites a value saved on the platform after its preview. When the preview finds no conflict, the push now commits with conflict checking on (`fail`) instead of `override`. A value a translator saves between the preview and the commit then stops the push. The error says how many values changed, that nothing was written, and to run the push again. The platform side of this check, which compares under its lock, ships with the matching platform release.
