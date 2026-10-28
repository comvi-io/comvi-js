<script setup lang="ts">
import { useI18n } from "@comvi/vue";

// `locale` is writable: v-model switches, and the select keeps the old value
// until the new locale's catalogs are in.
const { locale, isLoading } = useI18n();
const locales = ["en", "de", "fr", "es", "uk", "ar"];
</script>

<template>
  <select
    v-model="locale"
    :disabled="isLoading"
    class="border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 disabled:opacity-50"
  >
    <option v-for="loc in locales" :key="loc" :value="loc">
      {{ loc.toUpperCase() }}
    </option>
  </select>
</template>
