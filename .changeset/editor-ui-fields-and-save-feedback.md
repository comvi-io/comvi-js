---
"@comvi/plugin-in-context-editor": patch
---

The in-context editor's form looks and behaves like a form again.

- Unchecked checkboxes show their box, and every translation field has a border and a focus ring, in the light and the dark theme. The editor renders in a shadow root, where Tailwind's `@property` defaults do not apply, so every border utility drew nothing; the editor's stylesheet now declares those defaults itself.
- While a save is pending, the form stays on screen with its fields and controls disabled, instead of being replaced by the loading skeleton.
- A new save clears the toasts of earlier ones, so a failed save shows its error without the previous save's "Saved" toast beside it.
