---
"@comvi/plugin-in-context-editor": patch
---

A save in the in-context editor with nothing to write no longer sends a request. Before, an edit typed and then reverted still sent the key's plural flag, which could undo a plural change a teammate had just made on the platform. A save the platform accepted now also stays saved when the page cannot show the new value at once (for example a message the runtime rejects in development): the editor reports that the value appears after a reload, and saving again sends nothing.
