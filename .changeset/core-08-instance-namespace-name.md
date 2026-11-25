---
"@comvi/core": minor
---

In an app with generated types, `i18n.ns("acount")` is now a type error on the argument, and the message lists the declared namespaces; before, it compiled and the returned `t` errored at its first call as "This expression is not callable". A `string` variable is no declared name either, and an app without generated types still takes any name; nothing changes at run time.
