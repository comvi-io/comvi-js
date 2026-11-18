<script setup lang="ts">
// The `account` namespace is needed on this page only. `useI18n("account")` holds it:
// the server renders its text. On a client navigation, when it is not in place yet, load
// it explicitly and wait, so the page appears with its text. The error is already
// reported through `onError`; the page shows the fallback language's text.
const { isLoading, i18n } = useI18n("account");
if (isLoading.value) await i18n.load("account").catch(() => {});
</script>

<template>
  <main>
    <AppHeader />
    <div class="cards">
      <AccountCard />
      <CatalogLoadingCard />
    </div>
    <AppFooter />
  </main>
</template>
