<script setup lang="ts">
const { locale, isLoading, locales } = useI18n();
const switchLocalePath = useSwitchLocalePath();

const onLocaleChange = async (event: Event) => {
  const target = event.target as HTMLSelectElement;
  await navigateTo(switchLocalePath(target.value));
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
