<script setup lang="ts">
import { ref } from "vue";
import { useI18n, useI18nLoader } from "@comvi/vue";

// Rows from the `account` namespace, which loads the first time this renders.
defineProps<{ name: string }>();

const { t } = useI18n("account");
const { t: tApp } = useI18n();
const { addActiveNamespace } = useI18nLoader();

// Activating keeps `account` loaded across later locale switches. The rows wait
// for the load to settle, whether it succeeded or failed.
const ready = ref(false);
const done = () => (ready.value = true);
addActiveNamespace("account").then(done, done);
</script>

<template>
  <p v-if="!ready" class="body">{{ tApp("app.loading") }}</p>
  <template v-else>
    <p class="widget" data-testid="account-signed-in">{{ t("profile.signed_in", { name }) }}</p>
    <p class="widget" data-testid="account-devices">{{ t("profile.devices", { count: 3 }) }}</p>
    <!-- Only the English account catalog has this key. -->
    <p class="widget" data-testid="account-only-en">{{ t("profile.only_en") }}</p>
  </template>
</template>
