---
"@comvi/core": patch
---

A `{name}` placeholder whose parameter is a function no longer prints the function's source code. It now renders as a missing parameter does: the literal `{name}` by default, with a development warning that says the parameter is a function, or an empty string under `missingParam: "drop"`. This is what a translator hits by typing `{link}` where the message needs `<link>…</link>`, both in `t()` with a tag handler and in `<T components={{ link }}>`. Tag handlers themselves, and every other parameter value, are unchanged.
