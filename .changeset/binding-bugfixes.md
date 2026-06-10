---
"@comvi/nuxt": patch
"@comvi/vue": patch
"@comvi/plugin-locale-detector": patch
---

Fix four binding bugs found in the fleet-wide package audit:

- **nuxt**: server `useTranslation` passed a dead `language` param to `i18n.t()` — core reads `params.locale`, so the value was silently ignored and translations relied on instance state. Now passes `locale`. Also replaced the Nuxt 2-era `process.dev` with `import.meta.dev` in `useSwitchLocalePath` so the invalid-locale dev warning actually fires.
- **vue**: `formatNumber`/`formatDate`/`formatCurrency`/`formatRelativeTime` read the non-reactive core locale, so template usages did not re-render after a locale switch (React binding already behaved correctly). They now default to the reactive locale ref.
- **plugin-locale-detector**: cookies written with `sameSite: "none"` but no `secure` flag are rejected by modern browsers; `Secure` is now forced for `SameSite=None`.
