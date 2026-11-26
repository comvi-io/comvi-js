<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@comvi/vue";
import { locales } from "../i18n";
import LoadError from "./LoadError.vue";

// `locale` keeps showing the current language until the new one's catalogs are
// in, so the buttons never flicker.
const { t, locale, setLocale, isFetching } = useI18n();

// The locale whose switch failed, if any: its catalog could not be loaded.
const failed = ref<string | null>(null);

// A failed switch keeps the current language on screen, reports the error through
// onError and rejects; calling setLocale() again asks the loader again.
function switchTo(code: string) {
  failed.value = null;
  setLocale(code).catch(() => (failed.value = code));
}
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
        @click="switchTo(code)"
      >
        {{ code }}
      </button>
    </div>
    <span v-if="isFetching" class="status">{{ t("app.loading") }}</span>
  </div>
  <LoadError v-if="failed" @retry="switchTo(failed)" />
  <p class="note">{{ t("demo.rtl.body") }}</p>
</template>
