<script setup lang="ts">
const { t, locale, locales, setLocale, isLoading } = useI18n();

// The locale is part of the URL, so switching means navigating to this same
// page under another prefix.
const switchLocalePath = useSwitchLocalePath();

// Only the newest click navigates: a slower, earlier switch must not land a
// German page at the Ukrainian address.
let latestSelect = 0;

async function select(code: string) {
  if (code === locale.value) return;
  const request = ++latestSelect;
  // Switch first, navigate second: the page changes language the moment the
  // catalog arrives instead of waiting for the route to resolve.
  await setLocale(code);
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
  <p class="switcher-note">{{ t("demo.rtl.body") }}</p>
</template>
