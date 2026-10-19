---
"@comvi/core": patch
---

`#` in a plural branch resolves to that plural's count even after a tag handler inside the branch calls `t()` and catches what that render throws. Until now the count the failed inner plural had set stayed behind, and the outer `#` printed it.
