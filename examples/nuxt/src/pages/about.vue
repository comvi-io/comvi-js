<script setup lang="ts">
// The `account` namespace is needed on this page only. `useI18n("account")` holds it:
// the server renders its text. On a client navigation, when it is not in place yet, load
// it explicitly and wait, so the page appears with its text. A failed load resolves with
// the Error (and is reported through `onError`); the page then offers to load it again.
const { isFetching, i18n } = useI18n("account");
const failed = ref(false);
async function loadAccount() {
  const failure = await i18n.load("account");
  failed.value = failure !== undefined;
}
if (isFetching.value) await loadAccount();
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
