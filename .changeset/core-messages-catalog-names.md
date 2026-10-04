---
"@comvi/core": minor
---

Inline catalogs are now passed as `createI18n({ messages })`, and the catalog methods are `addMessages()`, `getMessages()`, `clearMessages()` and `reloadMessages()`; the `translationsCleared` event is `messagesCleared` and the `FlattenedTranslations` type is `FlattenedMessages`. The old names are removed, and a non-object `messages` throws `E_MESSAGES_NOT_OBJECT`.
