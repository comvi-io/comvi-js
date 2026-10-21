---
"@comvi/cli": patch
---

`comvi push --force-mode ask` no longer overwrites a value saved on the platform after its preview. When the preview finds no conflict, the push now commits with conflict checking on (`fail`) instead of `override`. A translator's edit made between the preview and the commit then stops the push with a conflict error instead of being replaced silently. Run the push again to see and resolve it.
