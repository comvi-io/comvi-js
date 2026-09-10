<script setup lang="ts">
import{useI18n}from"@comvi/vue";
const{t,reloadTranslations}=useI18n();
</script>

<template>
  <button @click="reloadTranslations()">{{ t("reload") }}</button>
</template>
