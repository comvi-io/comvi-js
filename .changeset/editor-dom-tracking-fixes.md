---
"@comvi/plugin-in-context-editor": patch
---

The in-context editor keeps up with a page that rearranges itself.

- An element the page moves or reorders stays editable.
- Every translation in one text node or attribute is tracked. For `<p>{{ t('hello') }} {{ t('bye') }}</p>`, Alt-click offers both keys in the key selector, each with its own preview, and context collection reports both. `NodeData.markers` lists them. A marker split across adjacent text nodes decodes on the node where it starts, and a broken marker fragment decodes to nothing rather than to a wrong key.
- A web component that attaches its shadow root inside another component's shadow tree after startup is observed, and its translations are editable.
- A DOM insertion scans only the inserted subtree. The editor ignores its own highlight overlay and tooltip, and a rescan that finds unchanged data republishes nothing.
- Alt-click resolves against the element's current parent, after the page moves it between containers.
- The highlight follows its element on every animation frame while a container scrolls, and repositions when the window is resized.
