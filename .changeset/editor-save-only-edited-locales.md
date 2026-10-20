---
"@comvi/plugin-in-context-editor": patch
---

Saving in the in-context editor now writes only the languages you edited. Before, every language of the key was sent back and marked "not reviewed" on the platform, so one German edit also reset the review status of the untouched English and French values. A language you changed and then typed back to its stored value counts as unedited; switching plural mode still rewrites every language, because each one is rebuilt.
