<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import { computed } from "vue";

const { t, locale } = useI18n();

const isRtl = computed(() => locale.value === "ar");
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">{{ t("nav.rtl") }}</h2>

    <div
      class="p-6 border rounded-lg"
      :class="isRtl ? 'bg-amber-50 border-amber-200' : 'bg-gray-50'"
    >
      <div class="flex gap-4 items-start">
        <div class="text-4xl">
          {{ isRtl ? "←" : "→" }}
        </div>
        <div>
          <h3 class="font-bold text-lg mb-2">
            {{ isRtl ? "RTL Mode Active (Arabic)" : "LTR Mode Active" }}
          </h3>
          <p>
            {{ t("home.intro", { name: "User" }) }}
          </p>
          <p class="mt-2 text-sm opacity-75">
            Switch language to Arabic/English to see the layout flip.
          </p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="p-4 bg-white border shadow-sm">Item 1 (Start)</div>
      <div class="p-4 bg-white border shadow-sm">Item 2 (End)</div>
    </div>
  </div>
</template>
