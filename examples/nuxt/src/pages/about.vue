<script setup lang="ts">
// The `account` namespace is needed on this page only. `useI18n("account")` holds it:
// the server renders its text. On a client navigation, when it is not in place yet, load
// it explicitly and wait, so the page appears with its text. A failed load rejects (and
// is reported through `onError`); the page then offers to load it again.
const { isLoading, i18n } = useI18n("account");
const failed = ref(false);
async function loadAccount() {
  failed.value = await i18n.load("account").then(
    () => false,
    () => true,
  );
}
if (isLoading.value) await loadAccount();
</script>

<template>
  <main>
    <AppHeader />
    <div class="cards">
      <AccountCard :failed="failed" @retry="loadAccount" />
      <CatalogLoadingCard />
    </div>
    <AppFooter />
  </main>
</template>
