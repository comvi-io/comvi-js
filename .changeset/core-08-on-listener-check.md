---
"@comvi/core": patch
---

In development, `i18n.on()` throws a `TypeError` when it is given anything but a listener function, such as the event name of the 0.7 `on(event, fn)`. Before, the value was kept as a subscriber and the next change failed far from the call. The production build is unchanged.
