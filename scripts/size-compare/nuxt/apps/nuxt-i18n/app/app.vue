<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <p>{{ t("greeting", { name: "world" }) }}</p>
</template>
