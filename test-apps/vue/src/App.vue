<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import { watch } from "vue";
import LanguageSwitcher from "./components/LanguageSwitcher.vue";

const { locale, t, isLoading } = useI18n();

watch(
  locale,
  (loc) => {
    document.documentElement.dir = loc === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = loc;
  },
  { immediate: true },
);

const navItems = [
  { path: "/", label: "nav.home" },
  { path: "/plurals", label: "nav.plurals" },
  { path: "/rich-text", label: "nav.rich_text" },
  { path: "/namespaces", label: "nav.namespaces" },
  { path: "/rtl", label: "nav.rtl" },
] as const;
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans">
    <nav class="bg-white shadow mb-8 sticky top-0 z-50">
      <div class="container mx-auto px-4 py-4 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-bold text-blue-600">Comvi Vue Example</h1>
        </div>
        <div class="flex gap-4 items-center">
          <div v-if="isLoading" class="text-sm text-gray-500 italic">
            {{ t("common.loading") }}
          </div>
          <LanguageSwitcher />
        </div>
      </div>
      <div class="container mx-auto px-4 border-t flex gap-2 overflow-x-auto py-2">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="px-3 py-2 rounded text-sm hover:bg-gray-100 whitespace-nowrap transition-colors"
          active-class="bg-blue-50 text-blue-700 font-medium"
        >
          {{ t(item.label) }}
        </router-link>
      </div>
    </nav>

    <main class="container mx-auto px-4 pb-12">
      <div class="bg-white rounded-lg shadow p-6 min-h-[300px]">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
