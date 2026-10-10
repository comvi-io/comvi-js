---
"@comvi/plugin-in-context-editor": patch
---

The in-context editor's form looks and behaves like a form again.

- Unchecked checkboxes show their box, and every translation field has a border and a focus ring, in the light and the dark theme. The editor renders in a shadow root, where Tailwind's `@property` defaults do not apply, so every border utility drew nothing; the editor's stylesheet now declares those defaults itself.
- While a save is pending, the form stays on screen with its fields and controls disabled, instead of being replaced by the loading skeleton.
- A new save clears the toasts of earlier ones, so a failed save shows its error without the previous save's "Saved" toast beside it.
- A disabled primary button, such as Save & Close before any edit, uses the neutral disabled style, so its label stays readable in the dark theme instead of dark text on dark orange.
- The key selector shows a translation's value once: the stored value appears under the page text only when the two differ. The panel has the modal's border and shadow, so it stands out from the page.
