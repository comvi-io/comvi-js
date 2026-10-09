---
"@comvi/plugin-in-context-editor": patch
---

Saving in the edit modal keeps every translation intact:

- A save that finishes after you open another key updates only the key, namespace and app instance it was made for. It does not replace or close the modal you are now in. Escape and Discard wait while a save is pending, and Ctrl/Cmd+S shows the same "Saving..." state as the buttons.
- A message the plural and variant fields cannot rebuild exactly is edited as written in one field. This covers exact selectors such as `=0`, `offset:`, other nestings, multiline layout and text around the plural. Languages you did not edit are sent back exactly as stored.
- Adding variants to a plural message keeps its plural forms under every variant, and switching plural or variants off keeps the remaining values. The saved message never has empty branches.
