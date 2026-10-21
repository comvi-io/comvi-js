---
"@comvi/plugin-in-context-editor": patch
---

Saving in the in-context editor now writes only the languages whose value changed. Before, every language of the key was sent back and marked "not reviewed" on the platform, so one German edit also reset the review status of the untouched English and French values. A value typed back to what was stored, or one a plural or variant switch leaves as it was, is not sent either.
