<script setup lang="ts">
const { locale, setLocale, isLoading, locales } = useI18n();
const switchLocalePath = useSwitchLocalePath();

const onLocaleChange = async (event: Event) => {
  const nextLocale = (event.target as HTMLSelectElement).value;
  await setLocale(nextLocale);
  await navigateTo(switchLocalePath(nextLocale));
};
</script>

<template>
  <select
    :value="locale"
    :disabled="isLoading"
    class="border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 disabled:opacity-50"
    @change="onLocaleChange"
  >
    <option v-for="loc in locales" :key="loc" :value="loc" :selected="loc === locale">
      {{ loc.toUpperCase() }}
    </option>
  </select>
</template>
