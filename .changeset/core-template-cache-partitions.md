---
"@comvi/core": patch
---

Reduce template-cache lookup overhead: compiled templates are now partitioned by a numeric key (message compiler, syntax extensions, plural `#` context) instead of a string built on every lookup, still bounded by one global 1000-entry FIFO.

Fix a template-cache collision between message compilers when more than 65535 exist in one process. The overflow warning is removed because compiler ids no longer wrap.
