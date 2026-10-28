<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import { locales } from "../i18n";

// `locale` is writable: setting it switches. It keeps showing the current
// language until the new one's catalogs are in, so the buttons never flicker.
const { t, locale, isLoading } = useI18n();
</script>

<template>
  <div class="switcher-row">
    <span id="language-label" class="label">{{ t("app.language") }}</span>
    <div class="switcher" role="group" aria-labelledby="language-label">
      <button
        v-for="code in locales"
        :key="code"
        :data-testid="`locale-${code}`"
        :aria-pressed="locale === code"
        @click="locale = code"
      >
        {{ code }}
      </button>
    </div>
    <span v-if="isLoading" class="status">{{ t("app.loading") }}</span>
  </div>
  <p class="note">{{ t("demo.rtl.body") }}</p>
</template>
