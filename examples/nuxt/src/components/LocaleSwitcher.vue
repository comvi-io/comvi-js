<script setup lang="ts">
// The locale switcher, shared by the demo page and the second page. Nuxt
// auto-imports it from `components/`, as it does `useI18n()` from the module.
// `locales` is one of Nuxt's own additions to @comvi/vue's composable, read
// from runtime config.
const { t, locale, locales, setLocale, isLoading } = useI18n();

// The locale lives in the URL, so switching NAVIGATES: `switchLocalePath(code)`
// is this same page's address in another language, and the module's route
// middleware pre-loads that catalog before the page renders.
const switchLocalePath = useSwitchLocalePath();

// The newest click, so an older switch that resolves later never navigates.
let latestSelect = 0;

async function select(code: string) {
  if (code === locale.value) return;
  const request = ++latestSelect;
  // `setLocale` first so the switch is instant — it loads the catalog and
  // advances the locale state the page is already bound to, rather than waiting
  // for the navigation to land. The route middleware would set the same locale
  // from the new URL anyway, so this is about the moment of the change, not
  // about correctness.
  await setLocale(code);
  // Clicked uk, then de before uk's catalog arrived: uk's switch still
  // resolves, and navigating to /uk then would leave a German page at the
  // Ukrainian address. Only the newest click navigates.
  if (request !== latestSelect) return;
  await navigateTo(switchLocalePath(code));
}
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
        @click="select(code)"
      >
        {{ code }}
      </button>
    </div>
    <code v-if="isLoading" class="switcher-loading">{{ t("app.loading") }}</code>
  </div>
  <!-- `ar` is a right-to-left locale: the module writes <html dir="rtl"> for it -->
  <p class="switcher-note">{{ t("demo.rtl.body") }}</p>
</template>
