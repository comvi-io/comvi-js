<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { locale, setLocale, isLoading } = useI18n();
const locales = ["en", "de", "fr", "es", "uk", "ar"];

const onLocaleChange = async (event: Event) => {
  const target = event.target as HTMLSelectElement;
  await setLocale(target.value);
};
</script>

<template>
  <select
    :value="locale"
    :disabled="isLoading"
    class="border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 disabled:opacity-50"
    @change="onLocaleChange"
  >
    <option v-for="loc in locales" :key="loc" :value="loc">
      {{ loc.toUpperCase() }}
    </option>
  </select>
</template>
