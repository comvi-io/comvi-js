<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import { ref } from "vue";
import AdminPanel from "../components/AdminPanel.vue";

const { t } = useI18n();
const showAdmin = ref(false);
</script>

<template>
  <div class="space-y-8">
    <div class="flex justify-between items-start">
      <h2 class="text-2xl font-bold">{{ t("namespaces.title") }}</h2>
      <span
        class="px-2 py-1 rounded text-xs font-mono"
        :class="showAdmin ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
      >
        Admin NS: {{ showAdmin ? "LOADED" : "NOT LOADED" }}
      </span>
    </div>

    <div class="p-6 border rounded-lg bg-white space-y-4">
      <p>{{ t("namespaces.description") }}</p>

      <AdminPanel v-if="showAdmin" />
      <button
        v-else
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        @click="showAdmin = true"
      >
        {{ t("namespaces.load_admin") }}
      </button>
    </div>
  </div>
</template>
