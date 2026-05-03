<script setup lang="ts">
import { inject, computed } from "vue";
import { type Language } from "@/types";
import LanguageTranslation from "@/components/editModal/LanguageTranslation.vue";

defineProps<{
  languages: Language[];
}>();

const translationManager = inject<any>("translationManager");

if (!translationManager) {
  throw new Error("translationManager not provided");
}

const translations = computed(() => translationManager.translations.value);

function handleTranslationChange(languageCode: string, pluralForm: string, value: string) {
  translationManager.updateTranslation(languageCode, pluralForm, value);
}
</script>

<template>
  <div class="flex-1 overflow-y-auto" style="max-height: calc(90vh - 130px)">
    <div class="divide-y">
      <LanguageTranslation
        v-for="lang in languages"
        :key="lang.id"
        :lang="lang"
        :translations="translations[lang.code] || {}"
        @update:translation="handleTranslationChange"
      />
    </div>
  </div>
</template>
