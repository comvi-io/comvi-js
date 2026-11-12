<script setup lang="ts">
// A page namespace the layout does not use: loaded on the server render, by the browser
// loader on a client navigation.
const { t, isReady, isLoading, i18n } = useI18n("admin");
const count = ref(0);
</script>

<template>
  <section data-testid="admin" :data-ready="String(isReady)" :data-loading="String(isLoading)">
    <h1 data-testid="admin-title">
      {{ isReady ? t("welcome_admin") : isLoading ? "loading" : "unavailable" }}
    </h1>
    <!-- The error is already reported through `onError`; the branch above shows the result. -->
    <button data-testid="retry-load" @click="i18n.load('admin').catch(() => {})">retry</button>
    <button data-testid="admin-count" @click="count++">{{ count }}</button>
  </section>
</template>
