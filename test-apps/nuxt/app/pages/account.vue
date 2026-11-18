<script setup lang="ts">
// The page-wait recipe, on the protected namespace (nested JSON).
const { t, isReady, isLoading, i18n } = useI18n("account");
// When the catalog is awaited now, load the namespace explicitly and wait for the result.
// The error is already reported through `onError`; the page shows the fallback or the
// "unavailable" state.
if (isLoading.value) await i18n.load("account").catch(() => {});
</script>

<template>
  <section data-testid="account" :data-ready="String(isReady)" :data-loading="String(isLoading)">
    <template v-if="isReady">
      <h1 data-testid="account-title">{{ t("title") }}</h1>
      <p data-testid="account-heading">{{ t("profile.heading", { name: "Ada" }) }}</p>
    </template>
    <h1 v-else-if="isLoading" data-testid="account-title">loading</h1>
    <h1 v-else data-testid="account-title">
      unavailable
      <!-- The error is already reported through `onError`; the branch shows the result. -->
      <button data-testid="account-retry" @click="i18n.load('account').catch(() => {})">
        retry
      </button>
    </h1>
  </section>
</template>
