<script setup lang="ts">
import { inject } from "vue";
import { AlertTriangle } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import type { Language } from "@/types";
import ModalTranslation from "@/components/editModal/ModalTranslation.vue";
import ModalSidebar from "@/components/editModal/ModalSidebar.vue";
import { type Ref } from "vue";

const props = defineProps<{
  translationKey: Ref<string | number>;
  translationNamespace: Ref<string>;
  languages: Language[];
  isLoadingLanguages: boolean;
}>();

const translationManager = inject<any>("translationManager");

if (!translationManager) {
  throw new Error("translationManager not provided");
}
</script>

<template>
  <div class="flex flex-grow overflow-hidden" style="height: calc(90vh - 130px)">
    <ModalSidebar :languages="languages" />

    <!-- Loading skeleton -->
    <div
      v-if="translationManager.state.value.isLoading || isLoadingLanguages"
      class="flex-1 overflow-y-auto p-4 space-y-6"
    >
      <div v-for="i in 3" :key="i" class="space-y-3 animate-pulse">
        <div class="flex items-center gap-2">
          <div class="h-5 w-5 bg-muted"></div>
          <div class="h-5 w-28 bg-muted"></div>
        </div>
        <div class="h-20 w-full bg-muted/60"></div>
      </div>
    </div>

    <!-- Full-page error state -->
    <div
      v-else-if="translationManager.state.value.error && !translationManager.state.value.data"
      class="flex-1 flex items-center justify-center"
    >
      <div class="text-center max-w-md p-6">
        <div
          class="mx-auto mb-4 inline-flex p-3 bg-destructive/12 text-destructive border border-destructive/30"
        >
          <AlertTriangle class="h-10 w-10" />
        </div>
        <h3 class="text-lg font-semibold text-foreground mb-2">Error Loading Translation</h3>
        <p class="text-muted-foreground mb-4">{{ translationManager.state.value.error }}</p>
        <Button
          @click="
            translationManager.loadTranslation(
              props.translationKey.value,
              props.translationNamespace.value,
            )
          "
        >
          Try Again
        </Button>
      </div>
    </div>

    <!-- Content with optional inline error banner -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <div
        v-if="translationManager.state.value.error"
        class="mx-4 mt-3 p-3 bg-destructive/10 border border-destructive/30 flex items-center gap-2"
      >
        <AlertTriangle class="h-5 w-5 text-destructive shrink-0" />
        <p class="text-sm text-destructive flex-1">{{ translationManager.state.value.error }}</p>
        <button
          class="text-destructive/70 hover:text-destructive text-sm font-medium shrink-0"
          @click="translationManager.state.value.error = null"
        >
          Dismiss
        </button>
      </div>

      <ModalTranslation :languages="languages" class="flex-1 overflow-y-auto" />
    </div>
  </div>
</template>
