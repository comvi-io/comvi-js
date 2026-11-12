<script setup lang="ts">
const { t, locale, isLoading } = useI18n();
const { locales } = useRouteConfig();

// The locale is part of the URL, so switching is a navigation to this same page under
// another prefix: the URL, the text, the cookie and <html lang> move together. The old
// language stays on screen until the new one's catalogs are in. `router.push`, not
// `navigateTo()`: while a switch is still loading, Nuxt answers a `navigateTo()` from a
// click with the location only, and a second click would do nothing.
const switchLocalePath = useSwitchLocalePath();
const router = useRouter();
</script>

<template>
  <div class="switcher" role="group" :aria-label="t('app.language')">
    <span class="switcher-label">{{ t("app.language") }}</span>
    <div class="segmented">
      <button
        v-for="code in locales"
        :key="code"
        :data-testid="`locale-${code}`"
        :aria-pressed="locale === code"
        @click="router.push(switchLocalePath(code))"
      >
        {{ code }}
      </button>
    </div>
    <code v-if="isLoading" class="switcher-loading">{{ t("app.loading") }}</code>
  </div>
  <p class="switcher-note">{{ t("demo.rtl.body") }}</p>
</template>
