| Group | Bundle | min B | min+gz B | Packages in the bundle |
|---|---|---:|---:|---|
| core | @comvi/core | 15,069 | 5,601 | @comvi/core@0.6.0 |
| core | i18next | 43,683 | 14,061 | i18next@26.4.4 |
| core+icu | @comvi/core + /icu | 18,257 | 6,827 | @comvi/core@0.6.0 |
| core+icu | @comvi/core, same plural text, simple compiler (no ICU) | 15,089 | 5,617 | @comvi/core@0.6.0 |
| core+icu | i18next + i18next-icu | 82,452 | 25,677 | i18next@26.4.4, i18next-icu@2.5.0, @formatjs/fast-memoize@3.1.7, @formatjs/icu-skeleton-parser@2.1.12, @formatjs/icu-messageformat-parser@3.5.21, intl-messageformat@12.1.3 |
| core+icu | i18next, same plural text, no i18next-icu | 43,701 | 14,066 | i18next@26.4.4 |
| core+icu | intl-messageformat alone | 33,522 | 9,824 | @formatjs/fast-memoize@3.1.7, @formatjs/icu-skeleton-parser@2.1.12, @formatjs/icu-messageformat-parser@3.5.21, intl-messageformat@12.1.3 |
| core+icu | use-intl/core (react external: its shared chunk imports cloneElement and isValidElement from react) | 37,471 | 11,227 | @formatjs/fast-memoize@3.1.7, use-intl@4.14.9, @formatjs/icu-skeleton-parser@2.1.11, @formatjs/icu-messageformat-parser@3.5.18, intl-messageformat@11.2.15 |
| react | @comvi/react | 20,542 | 7,586 | @comvi/core@0.6.0, @comvi/react@0.6.0 |
| react | @comvi/react + /icu | 23,726 | 8,783 | @comvi/core@0.6.0, @comvi/react@0.6.0 |
| react | i18next + react-i18next | 58,464 | 19,631 | i18next@26.4.4, html-parse-stringify@4.0.1, react-i18next@17.0.16, use-sync-external-store@1.7.0 |
| react | use-intl (react) | 38,348 | 11,519 | @formatjs/fast-memoize@3.1.7, use-intl@4.14.9, @formatjs/icu-skeleton-parser@2.1.11, @formatjs/icu-messageformat-parser@3.5.18, intl-messageformat@11.2.15 |
| react+icu+loader | @comvi/react + /icu + cdnLoader | 33,213 | 12,147 | @comvi/core@0.6.0, @comvi/react@0.6.0, @comvi/plugin-fetch-loader@0.6.0 |
| react+icu+loader | i18next + react-i18next + icu + http-backend | 104,096 | 33,750 | i18next@26.4.4, i18next-icu@2.5.0, @formatjs/fast-memoize@3.1.7, @formatjs/icu-skeleton-parser@2.1.12, @formatjs/icu-messageformat-parser@3.5.21, intl-messageformat@12.1.3, i18next-http-backend@4.0.2, html-parse-stringify@4.0.1, react-i18next@17.0.16, use-sync-external-store@1.7.0 |
| vue | @comvi/vue | 23,270 | 7,698 | @comvi/vue@0.6.0, @comvi/core@0.6.0 |
| vue | @comvi/vue + /icu | 26,461 | 8,910 | @comvi/vue@0.6.0, @comvi/core@0.6.0 |
| vue | vue-i18n (lean flags, runtime compiler kept) | 53,234 | 18,575 | @intlify/shared@11.4.14, @intlify/message-compiler@11.4.14, @intlify/core-base@11.4.14, @vue/devtools-api@6.6.4, vue-i18n@11.4.14 |
| vue | vue-i18n (lean flags, precompiled message function, compiler dropped) | 36,684 | 13,679 | @intlify/shared@11.4.14, @intlify/message-compiler@11.4.14, @intlify/core-base@11.4.14, @vue/devtools-api@6.6.4, vue-i18n@11.4.14 |
| next-client | @comvi/next/client | 22,307 | 8,185 | @comvi/core@0.6.0, @comvi/next@0.6.0, @comvi/react@0.6.0 |
| next-client | @comvi/next/client + /icu | 25,491 | 9,399 | @comvi/core@0.6.0, @comvi/next@0.6.0, @comvi/react@0.6.0 |
| next-client | next-intl (client) | 40,909 | 12,454 | @formatjs/fast-memoize@3.1.7, use-intl@4.14.9, @formatjs/icu-skeleton-parser@2.1.11, @formatjs/icu-messageformat-parser@3.5.18, intl-messageformat@11.2.15, next-intl@4.14.9 |
| comvi-only | @comvi/next root composed (fw-next-root-composed) | 28,092 | 10,097 | @comvi/core@0.6.0, @comvi/next@0.6.0 |
| comvi-only | @comvi/next/server provider (fw-next-server-provider) | 4,267 | 1,988 | @comvi/core@0.6.0, @comvi/next@0.6.0, server-only@0.0.1 |
| comvi-only | @comvi/next/middleware (fw-next-middleware-edge) | 4,829 | 2,050 | @comvi/next@0.6.0 |
| comvi-only | @comvi/nuxt client runtime (fw-nuxt-client-default) | 25,875 | 8,717 | @comvi/nuxt@0.6.0, @comvi/core@0.6.0, @comvi/vue@0.6.0 |
| comvi-only | @comvi/nuxt/i18n entry, nothing external (fw-nuxt-i18n) | 26,410 | 9,640 | @comvi/core@0.6.0, @comvi/nuxt@0.6.0 |
| comvi-only | @comvi/nuxt everything composed (fw-nuxt-full-composite) | 42,073 | 14,496 | @comvi/nuxt@0.6.0, @comvi/core@0.6.0, @comvi/vue@0.6.0 |
