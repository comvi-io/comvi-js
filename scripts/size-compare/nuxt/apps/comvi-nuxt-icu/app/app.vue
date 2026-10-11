<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <p>{{ t("greeting", { count: 2, name: "world" }) }}</p>
</template>
