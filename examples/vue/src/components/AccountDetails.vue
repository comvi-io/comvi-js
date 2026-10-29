<script setup lang="ts">
import { useI18n } from "@comvi/vue";

// Rows from the `account` namespace, which the `/about` route loads (main.ts);
// useI18n("account") holds it while the page shows.
defineProps<{ name: string }>();

const { t } = useI18n("account");
</script>

<template>
  <p class="widget" data-testid="account-signed-in">{{ t("profile.signed_in", { name }) }}</p>
  <p class="widget" data-testid="account-devices">{{ t("profile.devices", { count: 3 }) }}</p>
  <!-- Only the English account catalog has this key. -->
  <p class="widget" data-testid="account-only-en">{{ t("profile.only_en") }}</p>
</template>
