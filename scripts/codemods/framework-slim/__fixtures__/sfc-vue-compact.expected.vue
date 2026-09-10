<script setup lang="ts">
import{useI18n, useI18nLoader}from"@comvi/vue";
const { t } = useI18n();
const { reloadTranslations } = useI18nLoader();
</script>

<template>
  <button @click="reloadTranslations()">{{ t("reload") }}</button>
</template>
