<script setup lang="ts">
import { useI18n } from "@comvi/vue";

// Mounted on demand: useI18n("admin") loads the admin namespace after it mounts.
const { t, isLoading } = useI18n("admin");
const { t: common } = useI18n();
</script>

<template>
  <p v-if="isLoading" class="italic text-gray-500">{{ common("common.loading") }}</p>
  <div v-else class="space-y-4 border-t pt-4 mt-4">
    <h3 class="font-bold text-lg text-purple-600">{{ t("welcome_admin") }}</h3>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
        {{ t("dashboard") }}
      </div>
      <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
        {{ t("settings") }}
      </div>
      <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
        {{ t("users") }}
      </div>
    </div>
  </div>
</template>
