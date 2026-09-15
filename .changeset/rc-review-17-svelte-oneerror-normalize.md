---
"@comvi/svelte": patch
---

Fixed `setI18nContext`'s auto-init `onError` being able to receive a non-Error value (a thrown string, object, etc.) despite being typed to receive an `Error`. A non-Error rejection is now normalized into an `Error`, with the original value kept on `cause`, matching react/solid/vue.
