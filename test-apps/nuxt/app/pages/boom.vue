<script setup lang="ts">
// Lifecycle e2e: the page render throws on the server while a load is in flight.
const { i18n } = useI18n();
if (import.meta.server) {
  void i18n.load("hang").catch(() => {});
  throw createError({ statusCode: 500, statusMessage: "e2e" });
}
</script>

<template>
  <p>boom</p>
</template>
