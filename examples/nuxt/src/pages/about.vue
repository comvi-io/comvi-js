<script setup lang="ts">
// The `account` namespace is needed on this page only. Awaiting it here means
// the server renders its text, and a client navigation shows the page once the
// catalog has arrived.
const { addActiveNamespace } = useI18nLoader();
await addActiveNamespace("account");
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
